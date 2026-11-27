"""US-14 (CR-0012, change E11): prices in rupees first, the dollar-to-rupee rate as an item, trend graphs from the
gateway's price history, and the founder's switch for sharing Zerodha prices. A fake market and, where Postgres is
installed, a throwaway database shaped like the market data contract (with Market Gateway E4's additions). Nothing real
is called."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from conftest import NOW
from distill import app as app_mod
from distill import market, sharing
from distill.market import FakeMarket, Instrument, PricePoint, PriceRow
from distill.models import UserState, Watchlist
from fastapi.testclient import TestClient
from test_us9_watchlist import EPAM, GOLD, TCS, app_role_url, row  # noqa: F401  (app_role_url is a fixture)

USDINR = Instrument("FX:USDINR", "USDINR", "FX", "US dollar in rupees", "fx", "INR", "frankfurter", "fx")
GOLDM = Instrument("MCX:GOLDM", "GOLDM", "MCX", "GOLD MINI", "commodity", "INR", "kite")


def fx_row(rate=92.46, *, prev=92.10, error=None) -> PriceRow:
    at = datetime(2026, 11, 24, 15, 0, tzinfo=UTC)  # 16:00 Frankfurt
    change = None if rate is None or prev is None else round(rate - prev, 4)
    return PriceRow("FX:USDINR", rate, "INR", prev, change, None if change is None else 0.39, at, at, "closed", "eod", "frankfurter", error)


@pytest.fixture
def mk():
    m = FakeMarket(instruments_={i.key: i for i in (TCS, EPAM, GOLD, USDINR, GOLDM)}, heartbeat_at=NOW - timedelta(seconds=30))
    m.prices_ = {
        "NSE:TCS": row("NSE:TCS", 2640.3, prev=2630.3),
        "US:EPAM": row("US:EPAM", 164.63, prev=160.0, delay="15min", src="finnhub", currency="USD"),
        "GOLD:XAU_USD": row("GOLD:XAU_USD", 2650.0, src="metalcharts", currency="USD"),
        "MCX:GOLDM": row("MCX:GOLDM", 152217.5),
        "FX:USDINR": fx_row(),
    }
    return m


@pytest.fixture
def c(env, mk):
    env.role = "user"
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: mk
    app_mod.app.dependency_overrides[app_mod.get_user_role] = lambda: env.role
    return TestClient(app_mod.app)


def prices(c, keys):
    return c.get("/api/market/prices", params={"keys": ",".join(keys)}).json()


# ---------- rupees first ----------
def test_ac_14_1_dollar_prices_come_with_rupee_prices(c):
    """AC-14.1: a US-dollar price also comes in rupees at the gateway's rate; an Indian price stays rupees only."""
    got = {i["key"]: i for i in prices(c, ["US:EPAM", "NSE:TCS"])["items"]}
    epam = got["US:EPAM"]
    assert (epam["price"], epam["currency"]) == (164.63, "USD")
    assert epam["price_inr"] == round(164.63 * 92.46, 2) == 15221.69
    assert epam["prev_close_inr"] == round(160.0 * 92.46, 2) and epam["change_inr"] == round(4.63 * 92.46, 2)
    assert epam["change_pct"] == 2.89  # the % change is the same in both currencies
    tcs = got["NSE:TCS"]
    assert (tcs["price"], tcs["price_inr"], tcs["change_inr"]) == (2640.3, None, None)


def test_ac_14_2_the_rate_and_its_time_come_with_the_prices(c, mk):
    """AC-14.2: the rate used, and when it is from, come in the same answer; it is read only when a dollar price is shown."""
    got = prices(c, ["US:EPAM"])
    assert got["fx"] == {"key": "FX:USDINR", "rate": 92.46, "as_of": "2026-11-24T15:00:00Z", "error": None}
    assert "FX:USDINR" not in [i["key"] for i in got["items"]] and got["hidden"] == []
    assert prices(c, ["NSE:TCS"])["fx"] is None  # no dollar price, no rate read


def test_ac_14_3_gold_spot_in_rupees_too(c):
    """AC-14.3: international gold (priced in dollars) is shown in rupees first like a US share."""
    gold = prices(c, ["GOLD:XAU_USD"])["items"][0]
    assert gold["price_inr"] == round(2650.0 * 92.46, 2)


@pytest.mark.parametrize("case", ["no_row", "no_price", "bad_rate"])
def test_ac_14_4_without_a_rate_prices_show_as_before(c, mk, case):
    """AC-14.4: before Market Gateway E4 (no FX row), or without a usable rate, dollar prices come alone and fx is null."""
    if case == "no_row":
        del mk.prices_["FX:USDINR"]
        del mk.instruments_["FX:USDINR"]
    elif case == "no_price":
        mk.prices_["FX:USDINR"] = fx_row(None, prev=None, error="Frankfurter didn't answer")
    else:
        mk.prices_["FX:USDINR"] = fx_row(0.0, prev=0.0)
    got = prices(c, ["US:EPAM", "NSE:TCS"])
    assert got["fx"] is None
    epam = got["items"][0]
    assert (epam["price"], epam["price_inr"], epam["status"]) == (164.63, None, "ok")


def test_ac_14_4_a_last_rate_with_an_error_is_still_used(c, mk):
    """AC-14.4: when the gateway kept its last rate with an error (AC-11.4 there), that rate is still used and the error passed on."""
    mk.prices_["FX:USDINR"] = fx_row(92.0, error="Frankfurter didn't answer")
    got = prices(c, ["US:EPAM"])
    assert got["fx"]["rate"] == 92.0 and got["fx"]["error"] == "Frankfurter didn't answer"
    assert got["items"][0]["price_inr"] == round(164.63 * 92.0, 2)


# ---------- the rate as an item ----------
def test_ac_14_5_the_rate_is_an_item_like_any_other(c, mk):
    """AC-14.5: "US dollar in rupees" can be watched; it shows in rupees, in the Currency group, as a daily reference rate."""
    assert c.post("/api/market/watch", json={"keys": ["FX:USDINR"]}).json()["watched"] == ["FX:USDINR"]
    assert "FX:USDINR" in mk.watch_symbols
    got = prices(c, ["FX:USDINR", "NSE:TCS"])
    fx = got["items"][0]
    assert (fx["category"], fx["group"], fx["market"], fx["currency"], fx["price"]) == ("fx", "currency", "FX", "INR", 92.46)
    assert (fx["display_name"], fx["short_name"], fx["label"]) == ("US dollar in rupees", "USD/INR", "Daily reference rate")
    assert "FX" not in got["markets"]  # a rate has no trading hours, so it never makes the list look paused or closed


def test_ac_14_5_category_without_the_gateway_column():
    """AC-14.5: on a gateway without `instruments.category`, the FX prefix still makes it a currency rate."""
    old = Instrument("FX:USDINR", "USDINR", "FX", "US dollar in rupees", "fx", "INR", "frankfurter")
    d = market.describe(old)
    assert (d["category"], d["group"], d["market"]) == ("fx", "currency", "FX")


@pytest.mark.parametrize("q", ["usd", "dollar", "rupee", "USDINR", "inr"])
def test_ac_14_6_currency_search(c, q):
    """AC-14.6: searching for the dollar or the rupee lists the rate."""
    got = [i["key"] for i in c.get("/api/market/search", params={"q": q}).json()]
    assert "FX:USDINR" in got


def test_ac_14_6_currency_filter(c):
    """AC-14.6: the Currency filter lists the rate with nothing typed, and only currency rates."""
    got = c.get("/api/market/search", params={"q": "", "group": "currency"}).json()
    assert [(i["key"], i["group"]) for i in got] == [("FX:USDINR", "currency")]
    assert c.get("/api/market/search", params={"q": "tcs", "group": "currency"}).json() == []
    assert "FX:USDINR" not in [i["key"] for i in c.get("/api/market/search", params={"q": "tcs"}).json()]


# ---------- trend graphs ----------
def ist(h, m, day=25):
    return datetime(2026, 11, day, h, m, tzinfo=UTC) - timedelta(hours=5, minutes=30)


def points(mk, key, times, start=100.0, step=1.0):
    mk.points_ = (mk.points_ or []) + [PricePoint(key, t, start + n * step) for n, t in enumerate(times)]


def test_ac_14_7_today_points_for_the_small_graph(c, mk):
    """AC-14.7: 1D is today's points in the item's market time (Indian time for NSE, New York time for US shares)."""
    app_mod.now = lambda: ist(3, 0)  # 25 Nov, 3 AM IST = 24 Nov, 4:30 PM in New York
    points(mk, "NSE:TCS", [ist(15, 30, day=24), ist(9, 15), ist(9, 20), ist(14, 25)])
    ny = lambda h, d=25: datetime(2026, 11, d, h, 0, tzinfo=UTC) + timedelta(hours=5)  # noqa: E731  New York (EST) to UTC
    points(mk, "US:EPAM", [ny(15, 23), ny(9, 24), ny(15, 24)], start=160)
    got = c.get("/api/market/history", params={"keys": "NSE:TCS,US:EPAM", "range": "1d"}).json()
    assert got["available"] is True and got["range"] == "1d"
    assert [p["at"] for p in got["series"]["NSE:TCS"]] == ["2026-11-25T03:45:00Z", "2026-11-25T03:50:00Z", "2026-11-25T08:55:00Z"]
    assert [p["price"] for p in got["series"]["NSE:TCS"]] == [101.0, 102.0, 103.0]
    # It is still 24 Nov in New York, so the US share's "today" is its 24 Nov session.
    assert [p["price"] for p in got["series"]["US:EPAM"]] == [161.0, 162.0]


def test_ac_14_7_no_history_yet_is_an_empty_line(c, mk):
    """AC-14.7: a new item, or a market that hasn't opened today, has no points (the app then shows arrow and change only)."""
    mk.points_ = []
    got = c.get("/api/market/history", params={"keys": "NSE:TCS", "range": "1d"}).json()
    assert got["available"] is True and got["series"] == {"NSE:TCS": []}


def test_ac_14_8_week_and_month(c, mk):
    """AC-14.8: 1W and 1M are the last 7 and 30 days, at most 160 points each, keeping the first and last."""
    app_mod.now = lambda: NOW
    times = [NOW - timedelta(minutes=5 * n) for n in range(0, 30 * 24 * 12, 3)]  # every 15 min for 30 days
    points(mk, "NSE:TCS", sorted(times))
    week = c.get("/api/market/history", params={"keys": "NSE:TCS", "range": "1w"}).json()["series"]["NSE:TCS"]
    month = c.get("/api/market/history", params={"keys": "NSE:TCS", "range": "1m"}).json()["series"]["NSE:TCS"]
    assert len(week) == len(month) == market.HISTORY_MAX_POINTS
    assert week[-1]["at"] == month[-1]["at"] == "2026-11-25T09:00:00Z"
    assert datetime.fromisoformat(week[0]["at"]) >= NOW - timedelta(days=7)
    assert datetime.fromisoformat(month[0]["at"]) < NOW - timedelta(days=29)
    assert c.get("/api/market/history", params={"keys": "NSE:TCS", "range": "5y"}).json()["range"] == "1d"  # unknown: 1D


def test_ac_14_8_gateway_without_history(c, mk):
    """AC-14.8: before Market Gateway E4 there is no price history: `available` is false and nothing else changes."""
    mk.points_ = None
    got = c.get("/api/market/history", params={"keys": "NSE:TCS", "range": "1w"})
    assert got.status_code == 200 and got.json()["available"] is False and got.json()["series"] == {}
    assert prices(c, ["NSE:TCS"])["items"][0]["price"] == 2640.3


def test_ac_14_8_history_follows_who_may_see(c, mk, env):
    """AC-14.8 with AC-9.8: history is only sent for items the person may see; a 21st key is refused; offline is plain."""
    points(mk, "NSE:TCS", [NOW - timedelta(minutes=5)])
    env.role = None
    got = c.get("/api/market/history", params={"keys": "NSE:TCS,US:EPAM", "range": "1w"}).json()
    assert set(got["series"]) == {"US:EPAM"} and got["hidden"] == ["NSE:TCS"]
    many = ",".join(f"US:A{n:02d}" for n in range(21))
    assert c.get("/api/market/history", params={"keys": many}).status_code == 422
    mk.offline = True
    r = c.get("/api/market/history", params={"keys": "US:EPAM"})
    assert r.status_code == 503 and r.json()["error"]["message"] == "Prices can't be reached right now."


# ---------- Zerodha prices for everyone (AC-9.8 changed, AC-14.9 to AC-14.11) ----------
def test_ac_9_8_signed_in_users_see_zerodha_while_shared(c, mk, env):
    """AC-9.8 (changed CR-0012): with sharing On (the default), every signed-in person can search, add and see Zerodha
    items, including "Gold rate, India"; a signed-out visitor still can't."""
    env.role = "user"
    assert "NSE:TCS" in [i["key"] for i in c.get("/api/market/search", params={"q": "tcs"}).json()]
    assert "MCX:GOLDM" in [i["key"] for i in c.get("/api/market/search", params={"q": "gold"}).json()]
    assert c.post("/api/market/watch", json={"keys": ["NSE:TCS", "MCX:GOLDM"]}).json()["watched"] == ["NSE:TCS", "MCX:GOLDM"]
    got = prices(c, ["NSE:TCS", "MCX:GOLDM"])
    assert [i["price"] for i in got["items"]] == [2640.3, 152217.5] and got["hidden"] == []
    env.role = None
    got = prices(c, ["NSE:TCS", "US:EPAM"])
    assert [i["key"] for i in got["items"]] == ["US:EPAM"] and got["hidden"] == ["NSE:TCS"]
    assert "NSE:TCS" not in [i["key"] for i in c.get("/api/market/search", params={"q": "tcs"}).json()]


def test_ac_14_9_founder_switch(c, env):
    """AC-14.9: the founder reads and flips "Share Zerodha prices with other users"; it applies at once, with no release."""
    env.role = "admin"
    got = c.get("/api/admin/market-sharing").json()
    assert got["share_kite"] is True and got["saved_in_database"] in (True, False)
    r = c.put("/api/admin/market-sharing", json={"share_kite": False}).json()
    assert r["share_kite"] is False and r["updated_at"] == "2026-11-25T09:00:00Z"
    env.role = "user"
    assert prices(c, ["NSE:TCS"])["hidden"] == ["NSE:TCS"]
    assert c.post("/api/market/watch", json={"keys": ["NSE:TCS"]}).json()["refused"] == ["NSE:TCS"]
    env.role = "admin"
    assert prices(c, ["NSE:TCS"])["items"][0]["key"] == "NSE:TCS"  # the founder always sees them
    c.put("/api/admin/market-sharing", json={"share_kite": True})
    env.role = "user"
    assert prices(c, ["NSE:TCS"])["hidden"] == []


@pytest.mark.parametrize(("role", "status"), [("user", 403), (None, 401)])
def test_ac_14_9_only_the_founder_changes_it(c, env, role, status):
    """AC-14.9: the switch and its API are for Distill's admin only."""
    env.role = role
    assert c.get("/api/admin/market-sharing").status_code == status
    assert c.put("/api/admin/market-sharing", json={"share_kite": False}).status_code == status
    assert env.sharing.value.share_kite is True


def test_ac_14_10_unreadable_switch_means_founder_only(c, env):
    """AC-14.10: if the switch can't be read, Zerodha items go back to the founder only (the safe side); the founder is told."""
    env.sharing.offline = True
    env.role = "user"
    got = prices(c, ["NSE:TCS", "US:EPAM"])
    assert got["hidden"] == ["NSE:TCS"] and [i["key"] for i in got["items"]] == ["US:EPAM"]
    env.role = "admin"
    assert prices(c, ["NSE:TCS"])["hidden"] == []
    r = c.put("/api/admin/market-sharing", json={"share_kite": False})
    assert r.status_code == 503 and r.json()["error"]["code"] == "sharing_offline"


async def test_ac_14_10_switch_is_read_at_most_every_30_seconds():
    """AC-14.10: the switch is cached for 30 seconds per server, and a change on this server applies at once."""

    class Counting(sharing.MemorySharing):
        reads = 0

        async def load(self):
            Counting.reads += 1
            return await super().load()

    s = Counting()
    sharing.forget_cache()
    assert await sharing.share_kite(s) is True and await sharing.share_kite(s) is True
    assert Counting.reads == 1
    await sharing.change(s, False)
    assert await sharing.share_kite(s) is False
    sharing.forget_cache()


def test_ac_14_11_each_watchlist_stays_private(c, env):
    """AC-14.11: sharing prices shares nothing else: each person's watchlist and pins stay in their own account."""
    env.user_id = "u_anna"
    mine = UserState(watchlist=Watchlist(keys=["NSE:TCS", "MCX:GOLDM"], pinned=["MCX:GOLDM"], updated_at="2026-11-25T08:00:00Z"))
    assert c.put("/api/me/state", json=mine.model_dump(mode="json")).status_code == 200
    env.user_id = "u_ben"
    theirs = c.get("/api/me/state").json()["state"]["watchlist"]
    assert theirs["keys"] == [] and theirs["pinned"] in ([], None)
    ben = UserState(watchlist=Watchlist(keys=["US:EPAM"], updated_at="2026-11-25T08:10:00Z"))
    c.put("/api/me/state", json=ben.model_dump(mode="json"))
    env.user_id = "u_anna"
    back = c.get("/api/me/state").json()["state"]["watchlist"]
    assert (back["keys"], back["pinned"]) == (["NSE:TCS", "MCX:GOLDM"], ["MCX:GOLDM"])
    # Nothing in the market answers names who watches what.
    assert "u_anna" not in c.get("/api/market/prices", params={"keys": "NSE:TCS"}).text
    assert c.get("/api/market/search", params={"q": "tcs"}).text.count("u_") == 0


def test_compat_v080_watchlist_and_prices_unchanged(c, env):
    """CR-0012 compatibility: a watchlist saved by v0.8.0 reads unchanged, and the v0.8.0 price fields are all still sent."""
    v080 = {"version": 1, "topics": {"sections": ["finance"], "keywords": [], "updated_at": "2026-11-26T07:00:00Z"}, "cards": [],
            "settings": {"last_refreshed_at": None, "theme": "system"},
            "watchlist": {"keys": ["NSE:TCS", "US:EPAM"], "more": [], "pinned": ["US:EPAM"], "strip": "feed", "version": 2,
                          "updated_at": "2026-11-26T07:00:00Z"}, "updated_at": "2026-11-26T07:00:00Z"}  # fmt: skip
    env.store.rows["u_test"] = UserState.model_validate(v080).model_dump_json()
    w = c.get("/api/me/state").json()["state"]["watchlist"]
    assert (w["keys"], w["pinned"], w["strip"]) == (["NSE:TCS", "US:EPAM"], ["US:EPAM"], "feed")
    item = prices(c, ["US:EPAM"])["items"][0]
    old_fields = {"key", "symbol", "name", "exchange", "type", "currency", "source", "category", "group", "display_name", "short_name",
                  "market", "status", "price", "prev_close", "change", "change_pct", "as_of", "label", "market_state", "error"}  # fmt: skip
    assert old_fields <= set(item) and item["price"] == 164.63 and item["currency"] == "USD"


# ---------- the real SQL ----------
E4_DDL = """
alter table market.instruments add column if not exists category text;
create table market.price_points (key text not null, at timestamptz not null, price numeric not null, primary key (key, at));
grant select on market.price_points to distill_app_test;
"""


async def test_ac_14_8_postgres_history_and_fx_as_the_app_role(app_role_url, pg_admin_url):  # noqa: F811
    """AC-14.2, AC-14.7, AC-14.8, AC-9.13: without `price_points` history is "not available"; with Market Gateway E4's table
    and FX row, history and the rate are read with only the app role's rights."""
    import psycopg

    pm = market.PostgresMarket(app_role_url)
    assert await pm.history(["NSE:TCS"], NOW - timedelta(days=1)) is None
    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute(E4_DDL)
        conn.execute("insert into market.instruments (key, symbol, exchange, name, type, currency, source, category) "
                     "values ('FX:USDINR', 'USDINR', 'FX', 'US dollar in rupees', 'fx', 'INR', 'frankfurter', 'fx')")  # fmt: skip
        r = fx_row()
        conn.execute("insert into market.prices values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                     (r.key, r.price, r.currency, r.prev_close, r.change, r.change_pct, r.as_of, r.fetched_at, r.market_state, r.delay, r.source, r.error))  # fmt: skip
        for n in range(3):
            conn.execute("insert into market.price_points values ('NSE:TCS', %s, %s)", (NOW - timedelta(minutes=5 * n), 4180 + n))
    pm = market.PostgresMarket(app_role_url)  # a fresh check of the gateway's optional parts
    got = await pm.history(["NSE:TCS", "US:EPAM"], NOW - timedelta(minutes=7))
    assert [(p.key, p.price) for p in got] == [("NSE:TCS", 4181.0), ("NSE:TCS", 4180.0)]
    out = await market.prices(pm, ["US:EPAM"], "user", NOW)
    assert out.fx is not None and out.fx.rate == 92.46
    assert (await market.search(pm, "dollar", "user"))[0].key == "FX:USDINR"


async def test_ac_14_9_postgres_switch(pg_admin_url):
    """AC-14.9: the switch is one row in Distill's own `distill_settings` table; it starts On and keeps what the founder set."""
    import psycopg

    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute("drop table if exists distill_settings")
    s = sharing.PostgresSharing(pg_admin_url)
    assert (await s.load()).share_kite is True
    await sharing.change(s, False, NOW)
    again = sharing.PostgresSharing(pg_admin_url)
    got = await again.load()
    assert got.share_kite is False and got.updated_at == "2026-11-25T09:00:00Z"
    sharing.forget_cache()
    assert await sharing.share_kite(sharing.PostgresSharing("postgresql://nobody@127.0.0.1:9/none", connect_timeout=1)) is False
