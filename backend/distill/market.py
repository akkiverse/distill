"""Prices for the watchlist (US-9), behind the `MarketData` adapter.

Prices are written by the founder's Market Gateway into a separate, shared Neon database (schema `market`), following the
market data contract in the hub (docs/contracts/market-data.md). Distill connects to it as `MARKET_DATABASE_URL` (the
contract's `app` role): it reads `instruments`, `prices` and `gateway_status`, and writes only `watch_symbols` (AC-9.13).
It never uses `DATABASE_URL` for these tables and never calls a price provider itself. See ADR-0005.

From CR-0006 it also reads `market_calendar` and `instruments.category` when the gateway has them (Market Gateway E1),
and otherwise works them out itself (`names.py`, `hours.py`). See ADR-0006.

From CR-0012 (Market Gateway E4) it also reads the `FX:USDINR` price row, to show US prices in rupees first, and
`market.price_points`, for the trend graphs, whenever the gateway has them; without them prices show as before. See ADR-0012.
"""

from __future__ import annotations

import logging
import math
import os
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from typing import Literal, Protocol

from pydantic import BaseModel

from . import hours, names
from .hours import IST, NEW_YORK, CalendarRow, MarketOut

log = logging.getLogger("distill.market")

MAX_WATCH = 20  # AC-9.2 (changed CR-0006: was 10)
SEARCH_FETCH = 100  # rows read before the gold kinds are kept apart (AC-10.5)
FEATURES_TTL = timedelta(minutes=10)  # how long a check for the gateway's optional parts is trusted (AC-10.9)
SEARCH_LIMIT = 20  # AC-9.1
# The gateway's fixed gold rows (AC-10.13, added CR-0007): looked up by key on a gold search, so dozens of bonds,
# ETFs and funds that also say "gold" can never push them out of the rows read.
FIXED_GOLD = ("MCX:GOLDM", "GOLD:XAU_USD")
PAUSED_AFTER = timedelta(minutes=2)  # AC-9.6
ADMIN_ROLE = "admin"
KITE = "kite"  # prices from the studio's Zerodha connection: who sees them is AC-9.8 (changed CR-0012) and sharing.py
FX_KEY = "FX:USDINR"  # the gateway's US dollar to rupee rate (Market Gateway E4, AC-14.2)
HISTORY_RANGES = {"1d": None, "1w": timedelta(days=7), "1m": timedelta(days=30)}  # AC-14.7, AC-14.8
HISTORY_MAX_POINTS = 160  # per item and range: enough for a smooth line, small enough for a phone
KEY_RE = re.compile(r"^[A-Z0-9_]{2,12}:[A-Za-z0-9_.&\-]{1,40}$")

# The only tables Distill touches (AC-9.13).
TABLES = (
    "market.instruments", "market.prices", "market.gateway_status", "market.watch_symbols", "market.market_calendar",
    "market.price_points",  # read only, for the trend graphs (added CR-0012)
)  # fmt: skip
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
    category: str | None = None  # the gateway's category (contract CR-0002); None on older rows and gateways


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


@dataclass(frozen=True)
class PricePoint:
    """One point of `market.price_points` (contract, Market Gateway CR-0005): a price at a 5-minute slot or a close."""

    key: str
    at: datetime
    price: float


@dataclass
class Snapshot:
    """One read for the watchlist: price rows, the gateway's last heartbeat and its calendar (None: no calendar table)."""

    rows: dict[str, PriceRow]
    heartbeat_at: datetime | None
    calendar: list[CalendarRow] | None


class MarketData(Protocol):
    async def search(self, q: str, *, include_kite: bool, limit: int = SEARCH_LIMIT, gold: bool = False) -> list[Instrument]: ...
    async def instruments(self, keys: Sequence[str]) -> dict[str, Instrument]: ...
    async def watch(self, keys: Sequence[str], at: datetime) -> None: ...
    async def prices(self, keys: Sequence[str]) -> tuple[dict[str, PriceRow], datetime | None]:
        """The latest price rows for `keys` and the gateway's last heartbeat (None if it never checked in)."""
        ...

    async def snapshot(self, keys: Sequence[str]) -> Snapshot: ...

    async def history(self, keys: Sequence[str], since: datetime) -> list[PricePoint] | None:
        """Points at or after `since` for `keys`, oldest first; None when the gateway has no `price_points` table yet."""
        ...


# ---------- API shapes ----------
Group = Literal["gold", "india", "us", "currency"]


class InstrumentOut(BaseModel):
    key: str
    symbol: str
    exchange: str
    name: str
    type: str
    currency: str
    source: str
    category: str = names.STOCK  # AC-10.6 (added CR-0006)
    group: Group = "india"  # AC-10.2
    display_name: str = ""  # AC-10.10
    short_name: str = ""  # AC-10.1
    market: str = ""  # NSE, US, MCX, GOLD or AMFI: whose hours it follows


class PriceItem(BaseModel):
    key: str
    symbol: str
    name: str
    exchange: str
    type: str
    currency: str
    source: str
    category: str = names.STOCK
    group: Group = "india"
    display_name: str = ""
    short_name: str = ""
    market: str = ""
    status: Literal["ok", "waiting", "error"]
    price: float | None = None
    prev_close: float | None = None
    change: float | None = None
    change_pct: float | None = None
    as_of: str | None = None
    label: str = ""
    market_state: str = ""
    error: str | None = None
    # AC-14.1 (added CR-0012): a US-dollar price in rupees, at the gateway's USD to INR rate; None without a rate
    price_inr: float | None = None
    prev_close_inr: float | None = None
    change_inr: float | None = None


class FxOut(BaseModel):
    """AC-14.2: the rate used for rupee prices, and when it is from."""

    key: str = FX_KEY
    rate: float
    as_of: str | None = None
    error: str | None = None


class GatewayOut(BaseModel):
    heartbeat_at: str | None
    paused: bool
    markets_closed: bool = False  # AC-9.15: every watched item's last price says its market is closed


class PricesResponse(BaseModel):
    items: list[PriceItem]
    hidden: list[str]  # keys this person may not see, or that are unknown
    gateway: GatewayOut
    markets: dict[str, MarketOut] = {}  # AC-10.9 (added CR-0006): the watched markets, from the calendar or the clock
    fx: FxOut | None = None  # AC-14.2 (added CR-0012): None when the gateway has no USD to INR rate (AC-14.4)
    read_at: str


class HistoryPoint(BaseModel):
    at: str
    price: float


class HistoryResponse(BaseModel):
    """AC-14.7, AC-14.8: price history for the trend graphs; `available` is false while the gateway keeps none."""

    range: str
    available: bool
    series: dict[str, list[HistoryPoint]]
    hidden: list[str]
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


def sees_kite(role: str | None, share: bool = False) -> bool:
    """AC-9.8 (changed CR-0012): the founder always; any signed-in person while sharing is On; never someone signed out."""
    return is_founder(role) or (share and bool(role))


def visible(inst: Instrument, role: str | None, share: bool = False) -> bool:
    """AC-9.8: Zerodha items only for the people `sees_kite` allows; every other source for everyone."""
    return inst.source != KITE or sees_kite(role, share)


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


def all_closed(items: Sequence[PriceItem]) -> bool:
    """AC-9.15: every watched item has a last price and that price says its market is closed."""
    return bool(items) and all(i.price is not None and i.market_state == "closed" for i in items)


def _num(v) -> float | None:
    return None if v is None else float(v)


def describe(inst: Instrument) -> dict:
    """AC-10.1, AC-10.2, AC-10.6, AC-10.10: kind, group, tidy and short names, and whose hours the item follows."""
    cat = names.category_of(inst.key, inst.symbol, inst.name, inst.type, inst.category)
    return {
        "category": cat,
        "group": names.group_of(cat, inst.key),
        "display_name": names.display_name(inst.key, inst.name),
        "short_name": names.short_name(inst.key, inst.symbol, inst.name, cat),
        "market": names.market_of(inst.key, cat),
    }


def instrument_out(inst: Instrument) -> InstrumentOut:
    fields = {k: v for k, v in inst.__dict__.items() if k != "category"}
    return InstrumentOut(**fields, **describe(inst))


FX_LABEL = "Daily reference rate"  # AC-14.5: a rate has no market session, so no "Market closed" label


def build_item(inst: Instrument, row: PriceRow | None, rate: float | None = None) -> PriceItem:
    base = PriceItem(
        key=inst.key, symbol=inst.symbol, name=inst.name, exchange=inst.exchange, type=inst.type,
        currency=(row.currency if row and row.currency else inst.currency), source=inst.source, status="waiting",
        **describe(inst),
    )  # fmt: skip
    if row is None or row.price is None:
        if row is not None and row.error:
            return base.model_copy(update={"status": "error", "error": row.error})
        return base  # AC-9.7: "Waiting for the first price"
    item = base.model_copy(
        update={
            "status": "error" if row.error else "ok",  # AC-9.7: the last price stays, with the error
            "price": _num(row.price),
            "prev_close": _num(row.prev_close),
            "change": _num(row.change),
            "change_pct": _num(row.change_pct),
            "as_of": iso(row.as_of),
            "label": FX_LABEL if base.category == names.FX else price_label(row.delay, row.market_state),
            "market_state": (row.market_state or "").lower(),
            "error": row.error,
        }
    )
    return in_rupees(item, rate)


def _times(v: float | None, rate: float) -> float | None:
    return None if v is None else round(v * rate, 2)


def in_rupees(item: PriceItem, rate: float | None) -> PriceItem:
    """AC-14.1: a US-dollar price also in rupees at the gateway's rate (the % change is the same in both)."""
    if rate is None or item.currency.upper() != "USD" or item.price is None:
        return item
    return item.model_copy(
        update={
            "price_inr": _times(item.price, rate),
            "prev_close_inr": _times(item.prev_close, rate),
            "change_inr": _times(item.change, rate),
        }
    )


def usable_rate(row: PriceRow | None) -> float | None:
    """AC-14.2, AC-14.4: the USD to INR rate when the gateway has one (a last rate with an error is still used)."""
    if row is None or row.price is None:
        return None
    rate = float(row.price)
    return rate if math.isfinite(rate) and rate > 0 else None


def gold_query(q: str) -> bool:
    """A search for gold (AC-10.5): also lists Sovereign Gold Bonds, whose names often don't say gold."""
    ql = q.lower()
    return "gold" in ql or ql.startswith(("sgb", "xau")) or ql == "sovereign"


def spread(found: list[InstrumentOut], limit: int = SEARCH_LIMIT) -> list[InstrumentOut]:
    """AC-9.1, AC-10.5: at most `limit`; when there are more, take turns between the kinds so every gold type shows."""
    if len(found) <= limit:
        return found
    buckets: dict[str, list[InstrumentOut]] = {}
    for i in found:
        buckets.setdefault(i.category, []).append(i)
    out: list[InstrumentOut] = []
    while len(out) < limit and any(buckets.values()):
        for b in buckets.values():
            if b and len(out) < limit:
                out.append(b.pop(0))
    keep = {i.key for i in out}
    return [i for i in found if i.key in keep]  # in the database's order (exact symbol first)


def fixed_gold_matches(inst: Instrument, q: str) -> bool:
    """AC-10.13: every word typed appears in the row's names ("gold" and "gold rate" yes; "goldbees" or "sgb" no)."""
    d = describe(inst)
    text = " ".join((inst.key, inst.symbol, inst.name, d["display_name"], d["short_name"])).lower()
    words = re.findall(r"[a-z0-9]+", q.lower())
    return bool(words) and all(w in text for w in words)


async def with_fixed_gold(data: MarketData, q: str, found: list[Instrument]) -> list[Instrument]:
    """AC-10.13 (added CR-0007): on a gold search, the India gold rate and gold spot come first (after an exact symbol
    match) when the gateway has them, even if more than SEARCH_FETCH other rows match. The founder-only rule (AC-9.8)
    still applies afterwards."""
    if not gold_query(q):
        return found
    have = {i.key: i for i in found}
    missing = [k for k in FIXED_GOLD if k not in have]
    extra = await data.instruments(missing) if missing else {}
    first = [inst for k in FIXED_GOLD if (inst := have.get(k) or extra.get(k)) and fixed_gold_matches(inst, q)]
    rest = [i for i in found if i.key not in {f.key for f in first}]
    exact = [i for i in rest if i.symbol.lower() == q.lower()]  # AC-9.1: an exact symbol match still leads
    return exact + first + [i for i in rest if i not in exact]


CURRENCY_WORDS = ("usd", "inr", "dollar", "rupee", "currency", "fx", "forex", "exchange rate")


def currency_query(q: str) -> bool:
    """AC-14.6: a search that should list the dollar-to-rupee rate, even if its symbol or name doesn't start that way."""
    ql = q.lower()
    return any(w in ql for w in CURRENCY_WORDS)


async def with_currency(data: MarketData, q: str, found: list[Instrument]) -> list[Instrument]:
    """AC-14.6 (added CR-0012): "US dollar in rupees" is listed on a currency search when the gateway has it."""
    if not currency_query(q) or any(i.key == FX_KEY for i in found):
        return found
    extra = await data.instruments([FX_KEY])
    return [extra[FX_KEY], *found] if FX_KEY in extra else found


async def search(data: MarketData, q: str, role: str | None, group: str | None = None, share: bool = False) -> list[InstrumentOut]:
    q = (q or "").strip()[:40]
    if not q and group == "gold":
        q = "gold"  # AC-10.5: choosing Gold with nothing typed lists the gold types
    if not q and group == "currency":
        q = "currency"  # AC-14.6: choosing Currency with nothing typed lists the rates
    if not q:
        return []
    found = await data.search(q, include_kite=sees_kite(role, share), limit=SEARCH_FETCH, gold=gold_query(q))
    found = await with_fixed_gold(data, q, found)
    found = await with_currency(data, q, found)
    out = [instrument_out(inst) for inst in found if visible(inst, role, share)]
    if group in ("gold", "india", "us", "currency"):
        out = [i for i in out if i.group == group]
    return spread(out)


async def watch(data: MarketData, keys: Sequence[str], role: str | None, now: datetime, share: bool = False) -> WatchResponse:
    """AC-9.3: upsert the keys this person may watch into market.watch_symbols."""
    wanted = clean_keys(keys)
    known = await data.instruments(wanted) if wanted else {}
    ok = [k for k in wanted if k in known and visible(known[k], role, share)]
    refused = [k for k in keys if k not in ok]
    if ok:
        await data.watch(ok, now)
    return WatchResponse(watched=ok, refused=refused)


async def prices(data: MarketData, keys: Sequence[str], role: str | None, now: datetime, share: bool = False) -> PricesResponse:
    wanted = clean_keys(keys)
    known = await data.instruments(wanted) if wanted else {}
    shown = [k for k in wanted if k in known and visible(known[k], role, share)]
    # AC-14.2: the USD to INR rate is read in the same request whenever a dollar price is shown (no extra round trip)
    needs_fx = any(known[k].currency.upper() == "USD" for k in shown) and FX_KEY not in shown
    snap = await data.snapshot([*shown, FX_KEY] if needs_fx else shown)
    fx_row = snap.rows.get(FX_KEY)
    rate = usable_rate(fx_row)
    items = [build_item(known[k], snap.rows.get(k), rate) for k in shown]  # never a Zerodha price for someone not allowed
    heartbeat = snap.heartbeat_at
    priced = [i for i in items if i.market != "FX"]  # a daily rate never says whether markets are closed
    return PricesResponse(
        items=items,
        hidden=[k for k in keys if k not in shown],
        gateway=GatewayOut(heartbeat_at=iso(heartbeat), paused=paused(heartbeat, now), markets_closed=all_closed(priced or items)),
        markets=hours.markets_for({i.market for i in items}, snap.calendar, now),
        fx=FxOut(rate=rate, as_of=iso(fx_row.as_of), error=fx_row.error) if rate is not None and fx_row else None,
        read_at=iso(now) or "",
    )


def day_start(market: str, now: datetime) -> datetime:
    """AC-14.7: the start of today in the item's market time (New York for US shares, Indian time for everything else)."""
    zone = NEW_YORK if market == "US" else IST
    local = now.astimezone(zone)
    return datetime.combine(local.date(), time(0, 0), zone).astimezone(UTC)


def thin(points: list[PricePoint], limit: int = HISTORY_MAX_POINTS) -> list[PricePoint]:
    """At most `limit` points, evenly spread, always keeping the first and the last."""
    if len(points) <= limit:
        return points
    step = (len(points) - 1) / (limit - 1)
    return [points[round(i * step)] for i in range(limit)]


async def history(data: MarketData, keys: Sequence[str], rng: str, role: str | None, now: datetime, share: bool = False) -> HistoryResponse:
    """AC-14.7, AC-14.8: today's points (1D) or the last 7 or 30 days (1W, 1M) for the items this person may see."""
    rng = rng if rng in HISTORY_RANGES else "1d"
    wanted = clean_keys(keys)
    known = await data.instruments(wanted) if wanted else {}
    shown = [k for k in wanted if k in known and visible(known[k], role, share)]
    hidden = [k for k in keys if k not in shown]
    span = HISTORY_RANGES[rng]
    starts = {k: (now - span) if span else day_start(names.market_of(k, describe(known[k])["category"]), now) for k in shown}
    points = await data.history(shown, min(starts.values())) if shown else []
    if points is None:  # AC-14.8: no history table yet (gateway before E4)
        return HistoryResponse(range=rng, available=False, series={}, hidden=hidden, read_at=iso(now) or "")
    by: dict[str, list[PricePoint]] = {k: [] for k in shown}
    for p in sorted(points, key=lambda p: p.at):
        if p.key in by and p.at >= starts[p.key] and math.isfinite(p.price):
            by[p.key].append(p)
    series = {k: [HistoryPoint(at=iso(p.at) or "", price=p.price) for p in thin(v)] for k, v in by.items()}
    return HistoryResponse(range=rng, available=True, series=series, hidden=hidden, read_at=iso(now) or "")


# ---------- adapters ----------
@dataclass
class FakeMarket:
    """In memory, for tests and local runs."""

    instruments_: dict[str, Instrument] = field(default_factory=dict)
    prices_: dict[str, PriceRow] = field(default_factory=dict)
    watch_symbols: dict[str, tuple[datetime, datetime]] = field(default_factory=dict)
    heartbeat_at: datetime | None = None
    calendar_: list[CalendarRow] | None = None  # None: a gateway without the calendar table (v0.1.0)
    points_: list[PricePoint] | None = None  # None: a gateway without `price_points` (before E4)
    offline: bool = False

    def _check(self) -> None:
        if self.offline:
            raise MarketUnavailable("offline")

    async def search(self, q: str, *, include_kite: bool, limit: int = SEARCH_LIMIT, gold: bool = False) -> list[Instrument]:
        self._check()
        ql = q.lower()

        def hit(i: Instrument) -> bool:
            if i.symbol.lower().startswith(ql) or ql in i.name.lower():
                return True
            s = i.symbol.upper()
            return gold and (s.startswith("SGB") or s.endswith("-GB") or (i.category or "").startswith("gold"))

        def bond(i: Instrument) -> bool:  # AC-10.13: like the SQL, gold bonds come after the other gold rows
            s = i.symbol.upper()
            return s.startswith("SGB") or s.endswith("-GB")

        hits = [i for i in self.instruments_.values() if (include_kite or i.source != KITE) and hit(i)]
        hits.sort(key=lambda i: (i.symbol.lower() != ql, not i.symbol.lower().startswith(ql), gold and bond(i), i.symbol))
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

    async def snapshot(self, keys: Sequence[str]) -> Snapshot:
        rows, heartbeat = await self.prices(keys)
        return Snapshot(rows, heartbeat, list(self.calendar_) if self.calendar_ is not None else None)

    async def history(self, keys: Sequence[str], since: datetime) -> list[PricePoint] | None:
        self._check()
        if self.points_ is None:
            return None
        return sorted((p for p in self.points_ if p.key in keys and p.at >= since), key=lambda p: (p.key, p.at))


COLS = "key, symbol, exchange, name, type, currency, source"
# With the gateway's E1 the category column is read too (AC-10.6); `{cat}` is "" or ", category".
SEARCH_SQL = """
select key, symbol, exchange, name, type, currency, source{cat} from market.instruments
where (symbol ilike %(prefix)s or name ilike %(contains)s or (%(gold)s and (symbol ilike 'SGB%%' or symbol ilike '%%-GB'{gold_cat})))
  and (%(include_kite)s or source <> 'kite')
order by (upper(symbol) = upper(%(q)s)) desc, (symbol ilike %(prefix)s) desc,
  (%(gold)s and (symbol ilike 'SGB%%' or symbol ilike '%%-GB')) asc, symbol
limit %(limit)s
"""
INSTRUMENTS_SQL = "select key, symbol, exchange, name, type, currency, source{cat} from market.instruments where key = any(%s)"
PRICES_SQL = (
    "select key, price, currency, prev_close, change, change_pct, as_of, fetched_at, market_state, delay, source, error "
    "from market.prices where key = any(%s)"
)
STATUS_SQL = "select heartbeat_at from market.gateway_status where id = 1"
CALENDAR_SQL = (
    "select market, state, session_opens, session_closes, next_open_at, next_close_at, note, updated_at from market.market_calendar"
)
# History for the trend graphs (AC-14.7, added CR-0012): read only, newest 30 days at most (the gateway keeps 30).
HISTORY_SQL = "select key, at, price from market.price_points where key = any(%s) and at >= %s and price is not null order by key, at"
# Which optional parts of the contract this gateway has (AC-10.9): the category column, the calendar table and (CR-0012)
# the price history table.
FEATURES_SQL = """
select table_name, column_name from information_schema.columns
where table_schema = 'market' and ((table_name = 'instruments' and column_name = 'category') or table_name = 'market_calendar'
  or table_name = 'price_points')
"""
# The only write (AC-9.3, AC-9.13): first_wanted_at is kept, last_wanted_at moves forward.
WATCH_SQL = """
insert into market.watch_symbols (key, first_wanted_at, last_wanted_at)
select k, %(at)s, %(at)s from unnest(%(keys)s::text[]) as k
on conflict (key) do update set last_wanted_at = excluded.last_wanted_at
"""


def _like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@dataclass
class Features:
    category: bool = False
    calendar: bool = False
    history: bool = False
    checked_at: datetime | None = None


class PostgresMarket:
    """The shared market database. A short connection per request: Vercel functions keep nothing between calls."""

    def __init__(self, url: str, connect_timeout: int = 6) -> None:
        self.url = url
        self.connect_timeout = connect_timeout
        self.features = Features()

    async def _with(self, work):
        """Run `work(conn)` on one short connection; any database error is "unavailable"."""
        try:
            import psycopg
        except ImportError as exc:
            raise MarketUnavailable("driver") from exc
        try:
            conn = await psycopg.AsyncConnection.connect(self.url, connect_timeout=self.connect_timeout, prepare_threshold=None)
            async with conn:
                return await work(conn)
        except psycopg.Error as exc:
            log.info("market database didn't answer: %s", type(exc).__name__)
            raise MarketUnavailable(type(exc).__name__) from exc

    async def _features(self, conn) -> Features:
        """AC-10.9: ask once every 10 minutes whether the gateway has `instruments.category` and `market_calendar`."""
        now = datetime.now(UTC)
        f = self.features
        if f.checked_at is None or now - f.checked_at > FEATURES_TTL:
            rows = await (await conn.execute(FEATURES_SQL)).fetchall()
            self.features = f = Features(
                category=any(t == "instruments" for t, _ in rows),
                calendar=any(t == "market_calendar" for t, _ in rows),
                history=any(t == "price_points" for t, _ in rows),
                checked_at=now,
            )
        return f

    @staticmethod
    def _inst(r) -> Instrument:
        return Instrument(*r[:7], category=(r[7] if len(r) > 7 else None))

    async def search(self, q: str, *, include_kite: bool, limit: int = SEARCH_LIMIT, gold: bool = False) -> list[Instrument]:
        like = _like(q)
        params = {"q": q, "prefix": like + "%", "contains": "%" + like + "%", "include_kite": include_kite, "limit": limit, "gold": gold}

        async def work(conn):
            f = await self._features(conn)
            sql = SEARCH_SQL.format(cat=", category" if f.category else "", gold_cat=" or category like 'gold%%'" if f.category else "")
            return [self._inst(r) for r in await (await conn.execute(sql, params)).fetchall()]

        return await self._with(work)

    async def instruments(self, keys: Sequence[str]) -> dict[str, Instrument]:
        async def work(conn):
            f = await self._features(conn)
            sql = INSTRUMENTS_SQL.format(cat=", category" if f.category else "")
            return {r[0]: self._inst(r) for r in await (await conn.execute(sql, (list(keys),))).fetchall()}

        return await self._with(work)

    async def watch(self, keys: Sequence[str], at: datetime) -> None:
        async def work(conn):
            await conn.execute(WATCH_SQL, {"keys": list(keys), "at": at})
            await conn.commit()

        await self._with(work)

    async def snapshot(self, keys: Sequence[str]) -> Snapshot:
        """Prices, heartbeat and (when the table exists) the calendar, over one connection."""

        async def work(conn):
            f = await self._features(conn)
            rows = await (await conn.execute(PRICES_SQL, (list(keys),))).fetchall() if keys else []
            status = await (await conn.execute(STATUS_SQL)).fetchall()
            cal = [CalendarRow(*r) for r in await (await conn.execute(CALENDAR_SQL)).fetchall()] if f.calendar else None
            return Snapshot({r[0]: PriceRow(*r) for r in rows}, status[0][0] if status else None, cal)

        return await self._with(work)

    async def prices(self, keys: Sequence[str]) -> tuple[dict[str, PriceRow], datetime | None]:
        snap = await self.snapshot(keys)
        return snap.rows, snap.heartbeat_at

    async def history(self, keys: Sequence[str], since: datetime) -> list[PricePoint] | None:
        """AC-14.7, AC-14.8: the points, or None when this gateway has no `price_points` table yet."""

        async def work(conn):
            f = await self._features(conn)
            if not f.history:
                return None
            rows = await (await conn.execute(HISTORY_SQL, (list(keys), since))).fetchall()
            return [PricePoint(r[0], r[1], float(r[2])) for r in rows]

        return await self._with(work)


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
