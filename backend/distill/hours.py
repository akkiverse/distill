"""When each market is open (US-10, added CR-0006).

The Market Gateway writes `market.market_calendar` from its change E1 on (one row per market: NSE, US, MCX, GOLD, with
holidays and early closes). Distill uses a row when the table exists and the row fits the current time; otherwise, and for
gateways without the table, it falls back to these regular hours, weekdays only, without holidays (AC-10.9).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel

IST = ZoneInfo("Asia/Kolkata")
NEW_YORK = ZoneInfo("America/New_York")
MARKETS = ("NSE", "US", "MCX", "GOLD")

State = Literal["open", "closing", "closed"]


@dataclass(frozen=True)
class CalendarRow:
    """A row of `market.market_calendar`, as the contract defines it."""

    market: str
    state: str
    session_opens: datetime | None
    session_closes: datetime | None
    next_open_at: datetime | None
    next_close_at: datetime | None
    note: str | None
    updated_at: datetime | None


class MarketOut(BaseModel):
    market: str
    state: State
    next_open_at: str | None = None
    next_close_at: str | None = None
    note: str | None = None
    holiday: bool = False  # closed all day today for a holiday (the gateway's calendar only)
    source: Literal["gateway", "clock"]


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=UTC)).astimezone(UTC)


def iso(dt: datetime | None) -> str | None:
    dt = _utc(dt)
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def _session(market: str, day) -> tuple[datetime, datetime] | None:
    """Regular hours on a local date, or None on a weekend."""
    if day.weekday() >= 5:
        return None
    if market == "NSE":
        return datetime.combine(day, time(9, 15), IST), datetime.combine(day, time(15, 30), IST)
    if market == "US":
        return datetime.combine(day, time(9, 30), NEW_YORK), datetime.combine(day, time(16, 0), NEW_YORK)
    if market == "MCX":
        # The contract: MCX closes 23:30 IST while New York is on daylight saving time and 23:55 IST otherwise.
        dst = datetime.combine(day, time(12), NEW_YORK).dst() != timedelta(0)
        return datetime.combine(day, time(9, 0), IST), datetime.combine(day, time(23, 30) if dst else time(23, 55), IST)
    # GOLD spot: weekdays in India, as Distill v0.4.0 counted it.
    return datetime.combine(day, time(0, 0), IST), datetime.combine(day + timedelta(days=1), time(0, 0), IST)


def _zone(market: str) -> ZoneInfo:
    return NEW_YORK if market == "US" else IST


def clock(market: str, now: datetime) -> MarketOut:
    """AC-10.9: the market's state and next opening and close from its regular hours (no holidays)."""
    now = _utc(now) or datetime.now(UTC)
    local = now.astimezone(_zone(market)).date()
    for d in range(0, 9):
        s = _session(market, local + timedelta(days=d))
        if s is None:
            continue
        opens, closes = (t.astimezone(UTC) for t in s)
        if now < opens:
            return MarketOut(market=market, state="closed", next_open_at=iso(opens), next_close_at=iso(closes), source="clock")
        if now < closes:
            nxt = next_open_after(market, closes)
            return MarketOut(market=market, state="open", next_open_at=iso(nxt), next_close_at=iso(closes), source="clock")
    return MarketOut(market=market, state="closed", source="clock")  # not reached: a weekday always comes


def next_open_after(market: str, after: datetime) -> datetime | None:
    local = after.astimezone(_zone(market)).date()
    for d in range(0, 9):
        s = _session(market, local + timedelta(days=d))
        if s and s[0].astimezone(UTC) > after:
            return s[0].astimezone(UTC)
    return None


def fits(row: CalendarRow, now: datetime) -> bool:
    """A calendar row still describes now: an open market hasn't passed its close, a closed one hasn't passed its opening.
    A gateway that stopped before the weekend leaves "open" behind; that row no longer fits."""
    state = (row.state or "").lower()
    if state not in ("open", "closing", "closed"):
        return False
    if state in ("open", "closing"):
        close = _utc(row.next_close_at or row.session_closes)
        return close is not None and close > now
    nxt = _utc(row.next_open_at)
    return nxt is None or nxt > now


def effective(market: str, row: CalendarRow | None, now: datetime) -> MarketOut:
    """AC-10.9: the gateway's row when it fits the current time, otherwise the clock."""
    now = _utc(now) or datetime.now(UTC)
    if row is None or not fits(row, now):
        return clock(market, now)
    state: State = row.state.lower()  # type: ignore[assignment]
    holiday = state == "closed" and row.session_opens is None and bool(row.note) and now.astimezone(_zone(market)).weekday() < 5
    return MarketOut(
        market=market, state=state, next_open_at=iso(row.next_open_at), next_close_at=iso(row.next_close_at or row.session_closes),
        note=row.note or None, holiday=holiday, source="gateway",
    )  # fmt: skip


def markets_for(wanted: set[str], rows: list[CalendarRow] | None, now: datetime) -> dict[str, MarketOut]:
    by = {r.market.upper(): r for r in rows or []}
    return {m: effective(m, by.get(m), now) for m in MARKETS if m in wanted}


def is_open(m: MarketOut) -> bool:
    return m.state in ("open", "closing")
