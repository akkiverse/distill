"""Prices for the watchlist (US-9), behind the `MarketData` adapter.

Prices are written by the founder's Market Gateway into a separate, shared Neon database (schema `market`), following the
market data contract in the hub (docs/contracts/market-data.md). Distill connects to it as `MARKET_DATABASE_URL` (the
contract's `app` role): it reads `instruments`, `prices` and `gateway_status`, and writes only `watch_symbols` (AC-9.13).
It never uses `DATABASE_URL` for these tables and never calls a price provider itself. See ADR-0005.
"""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal, Protocol

from pydantic import BaseModel

log = logging.getLogger("distill.market")

MAX_WATCH = 10  # AC-9.2
SEARCH_LIMIT = 20  # AC-9.1
PAUSED_AFTER = timedelta(minutes=2)  # AC-9.6
ADMIN_ROLE = "admin"
KITE = "kite"  # prices from the founder's Zerodha account: shown to the founder only (AC-9.8)
KEY_RE = re.compile(r"^[A-Z0-9_]{2,12}:[A-Za-z0-9_.&\-]{1,40}$")

# The only tables Distill touches (AC-9.13).
TABLES = ("market.instruments", "market.prices", "market.gateway_status", "market.watch_symbols")
WRITES = ("market.watch_symbols",)


class MarketUnavailable(Exception):
    """The market database didn't answer."""


# ---------- rows as the contract defines them ----------
@dataclass(frozen=True)
class Instrument:
    key: str
    symbol: str
    exchange: str
    name: str
    type: str
    currency: str
    source: str


@dataclass(frozen=True)
class PriceRow:
    key: str
    price: float | None
    currency: str
    prev_close: float | None
    change: float | None
    change_pct: float | None
    as_of: datetime | None
    fetched_at: datetime | None
    market_state: str
    delay: str
    source: str
    error: str | None


class MarketData(Protocol):
    async def search(self, q: str, *, include_kite: bool, limit: int = SEARCH_LIMIT) -> list[Instrument]: ...
    async def instruments(self, keys: Sequence[str]) -> dict[str, Instrument]: ...
    async def watch(self, keys: Sequence[str], at: datetime) -> None: ...
    async def prices(self, keys: Sequence[str]) -> tuple[dict[str, PriceRow], datetime | None]:
        """The latest price rows for `keys` and the gateway's last heartbeat (None if it never checked in)."""
        ...


# ---------- API shapes ----------
class InstrumentOut(BaseModel):
    key: str
    symbol: str
    exchange: str
    name: str
    type: str
    currency: str
    source: str


class PriceItem(BaseModel):
    key: str
    symbol: str
    name: str
    exchange: str
    type: str
    currency: str
    source: str
    status: Literal["ok", "waiting", "error"]
    price: float | None = None
    prev_close: float | None = None
    change: float | None = None
    change_pct: float | None = None
    as_of: str | None = None
    label: str = ""
    market_state: str = ""
    error: str | None = None


class GatewayOut(BaseModel):
    heartbeat_at: str | None
    paused: bool


class PricesResponse(BaseModel):
    items: list[PriceItem]
    hidden: list[str]  # keys this person may not see, or that are unknown
    gateway: GatewayOut
    read_at: str


class WatchRequest(BaseModel):
    keys: list[str]


class WatchResponse(BaseModel):
    watched: list[str]
    refused: list[str]


# ---------- rules ----------
def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def is_founder(role: str | None) -> bool:
    return role == ADMIN_ROLE


def visible(inst: Instrument, role: str | None) -> bool:
    """AC-9.8: Zerodha items for the founder only."""
    return inst.source != KITE or is_founder(role)


def clean_keys(keys: Sequence[str]) -> list[str]:
    out: list[str] = []
    for k in keys:
        k = (k or "").strip()
        if KEY_RE.match(k) and k not in out:
            out.append(k)
    return out[:MAX_WATCH]


def price_label(delay: str | None, market_state: str | None) -> str:
    """AC-9.5: what kind of price this is, from the contract's `delay` and `market_state`."""
    state = (market_state or "").lower()
    if state == "closed":
        return "Market closed, last close"
    if state == "pre":
        return "Pre-open, last close"
    d = (delay or "").strip().lower()
    if d in ("", "live", "realtime", "real-time"):
        return "Live"
    if m := re.fullmatch(r"(\d+)\s*(?:m|min|mins|minutes?)", d):
        return f"Delayed {int(m.group(1))} min"
    if d == "eod":
        return "End-of-day price"
    return f"Delayed ({delay})"


def paused(heartbeat_at: datetime | None, now: datetime) -> bool:
    """AC-9.6: the gateway hasn't checked in for more than 2 minutes (or never)."""
    if heartbeat_at is None:
        return True
    if heartbeat_at.tzinfo is None:
        heartbeat_at = heartbeat_at.replace(tzinfo=UTC)
    return now - heartbeat_at > PAUSED_AFTER


def _num(v) -> float | None:
    return None if v is None else float(v)


def build_item(inst: Instrument, row: PriceRow | None) -> PriceItem:
    base = PriceItem(
        key=inst.key, symbol=inst.symbol, name=inst.name, exchange=inst.exchange, type=inst.type,
        currency=(row.currency if row and row.currency else inst.currency), source=inst.source, status="waiting",
    )  # fmt: skip
    if row is None or row.price is None:
        if row is not None and row.error:
            return base.model_copy(update={"status": "error", "error": row.error})
        return base  # AC-9.7: "Waiting for the first price"
    return base.model_copy(
        update={
            "status": "error" if row.error else "ok",  # AC-9.7: the last price stays, with the error
            "price": _num(row.price),
            "prev_close": _num(row.prev_close),
            "change": _num(row.change),
            "change_pct": _num(row.change_pct),
            "as_of": iso(row.as_of),
            "label": price_label(row.delay, row.market_state),
            "market_state": (row.market_state or "").lower(),
            "error": row.error,
        }
    )


async def search(data: MarketData, q: str, role: str | None) -> list[InstrumentOut]:
    q = (q or "").strip()[:40]
    if not q:
        return []
    found = await data.search(q, include_kite=is_founder(role))
    return [InstrumentOut(**inst.__dict__) for inst in found if visible(inst, role)][:SEARCH_LIMIT]


async def watch(data: MarketData, keys: Sequence[str], role: str | None, now: datetime) -> WatchResponse:
    """AC-9.3: upsert the keys this person may watch into market.watch_symbols."""
    wanted = clean_keys(keys)
    known = await data.instruments(wanted) if wanted else {}
    ok = [k for k in wanted if k in known and visible(known[k], role)]
    refused = [k for k in keys if k not in ok]
    if ok:
        await data.watch(ok, now)
    return WatchResponse(watched=ok, refused=refused)


async def prices(data: MarketData, keys: Sequence[str], role: str | None, now: datetime) -> PricesResponse:
    wanted = clean_keys(keys)
    known = await data.instruments(wanted) if wanted else {}
    shown = [k for k in wanted if k in known and visible(known[k], role)]
    rows, heartbeat = await data.prices(shown)
    return PricesResponse(
        items=[build_item(known[k], rows.get(k)) for k in shown],  # never a Zerodha price for anyone but the founder
        hidden=[k for k in keys if k not in shown],
        gateway=GatewayOut(heartbeat_at=iso(heartbeat), paused=paused(heartbeat, now)),
        read_at=iso(now) or "",
    )


# ---------- adapters ----------
@dataclass
class FakeMarket:
    """In memory, for tests and local runs."""

    instruments_: dict[str, Instrument] = field(default_factory=dict)
    prices_: dict[str, PriceRow] = field(default_factory=dict)
    watch_symbols: dict[str, tuple[datetime, datetime]] = field(default_factory=dict)
    heartbeat_at: datetime | None = None
    offline: bool = False

    def _check(self) -> None:
        if self.offline:
            raise MarketUnavailable("offline")

    async def search(self, q: str, *, include_kite: bool, limit: int = SEARCH_LIMIT) -> list[Instrument]:
        self._check()
        ql = q.lower()
        hits = [
            i for i in self.instruments_.values()
            if (include_kite or i.source != KITE) and (i.symbol.lower().startswith(ql) or ql in i.name.lower())
        ]  # fmt: skip
        hits.sort(key=lambda i: (i.symbol.lower() != ql, not i.symbol.lower().startswith(ql), i.symbol))
        return hits[:limit]

    async def instruments(self, keys: Sequence[str]) -> dict[str, Instrument]:
        self._check()
        return {k: self.instruments_[k] for k in keys if k in self.instruments_}

    async def watch(self, keys: Sequence[str], at: datetime) -> None:
        self._check()
        for k in keys:
            first = self.watch_symbols.get(k, (at, at))[0]
            self.watch_symbols[k] = (first, at)

    async def prices(self, keys: Sequence[str]) -> tuple[dict[str, PriceRow], datetime | None]:
        self._check()
        return {k: self.prices_[k] for k in keys if k in self.prices_}, self.heartbeat_at


SEARCH_SQL = """
select key, symbol, exchange, name, type, currency, source from market.instruments
where (symbol ilike %(prefix)s or name ilike %(contains)s) and (%(include_kite)s or source <> 'kite')
order by (upper(symbol) = upper(%(q)s)) desc, (symbol ilike %(prefix)s) desc, symbol
limit %(limit)s
"""
INSTRUMENTS_SQL = "select key, symbol, exchange, name, type, currency, source from market.instruments where key = any(%s)"
PRICES_SQL = (
    "select key, price, currency, prev_close, change, change_pct, as_of, fetched_at, market_state, delay, source, error "
    "from market.prices where key = any(%s)"
)
STATUS_SQL = "select heartbeat_at from market.gateway_status where id = 1"
# The only write (AC-9.3, AC-9.13): first_wanted_at is kept, last_wanted_at moves forward.
WATCH_SQL = """
insert into market.watch_symbols (key, first_wanted_at, last_wanted_at)
select k, %(at)s, %(at)s from unnest(%(keys)s::text[]) as k
on conflict (key) do update set last_wanted_at = excluded.last_wanted_at
"""


def _like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class PostgresMarket:
    """The shared market database. A short connection per request: Vercel functions keep nothing between calls."""

    def __init__(self, url: str, connect_timeout: int = 6) -> None:
        self.url = url
        self.connect_timeout = connect_timeout

    async def _run(self, sql: str, params, *, fetch: bool = True, write: bool = False):
        try:
            import psycopg
        except ImportError as exc:
            raise MarketUnavailable("driver") from exc
        try:
            conn = await psycopg.AsyncConnection.connect(self.url, connect_timeout=self.connect_timeout, prepare_threshold=None)
            async with conn:
                cur = await conn.execute(sql, params)
                rows = await cur.fetchall() if fetch else []
                if write:
                    await conn.commit()
                return rows
        except psycopg.Error as exc:
            log.info("market database didn't answer: %s", type(exc).__name__)
            raise MarketUnavailable(type(exc).__name__) from exc

    async def search(self, q: str, *, include_kite: bool, limit: int = SEARCH_LIMIT) -> list[Instrument]:
        like = _like(q)
        params = {"q": q, "prefix": like + "%", "contains": "%" + like + "%", "include_kite": include_kite, "limit": limit}
        return [Instrument(*r) for r in await self._run(SEARCH_SQL, params)]

    async def instruments(self, keys: Sequence[str]) -> dict[str, Instrument]:
        return {r[0]: Instrument(*r) for r in await self._run(INSTRUMENTS_SQL, (list(keys),))}

    async def watch(self, keys: Sequence[str], at: datetime) -> None:
        await self._run(WATCH_SQL, {"keys": list(keys), "at": at}, fetch=False, write=True)

    async def prices(self, keys: Sequence[str]) -> tuple[dict[str, PriceRow], datetime | None]:
        rows = await self._run(PRICES_SQL, (list(keys),)) if keys else []
        status = await self._run(STATUS_SQL, None)
        return {r[0]: PriceRow(*r) for r in rows}, (status[0][0] if status else None)


_live: PostgresMarket | None = None


def market_url() -> str:
    """AC-9.13: its own variable; Distill's DATABASE_URL is never used for market tables."""
    return os.environ.get("MARKET_DATABASE_URL", "").strip()


def configured() -> bool:
    return bool(market_url())


def live_market() -> MarketData | None:
    global _live
    url = market_url()
    if not url:
        return None
    if _live is None or _live.url != url:
        _live = PostgresMarket(url)
    return _live
