"""US-10: Watchlist page and pinned prices strip (CR-0006), the server side: gold types, tidy names, search by group,
the market calendar with Distill's own clock as fallback, and watchlist version 2 with its migration from v0.4.0.
A fake market and, where Postgres is installed, throwaway databases shaped like the gateway as released (v0.1.0) and
with its change E1. Nothing real is called."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from conftest import NOW
from distill import app as app_mod
from distill import hours, market, names
from distill.hours import CalendarRow
from distill.market import FakeMarket, Instrument
from distill.models import UserState, Watchlist
from distill.rules import merge_states, upgrade_watchlist
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from test_us9_watchlist import CONTRACT_DDL, EPAM, GOLD, GOLDBEES, TCS, row

GOLDM = Instrument("MCX:GOLDM", "GOLDM", "MCX", "GOLD MINI", "commodity", "INR", "kite")
SGB = Instrument("NSE:SGBJUN31I-GB", "SGBJUN31I-GB", "NSE", "SGBJUN31I", "bond", "INR", "kite")
GOLDMF = Instrument("MF:119132", "119132", "AMFI", "HDFC Gold ETF Fund of Fund - Direct Plan - Growth Option", "mutual_fund", "INR", "amfi")
HDFCGOLD = Instrument("NSE:HDFCGOLD", "HDFCGOLD", "NSE", "HDFC GOLD EXCHANGE TRADED FUND", "etf", "INR", "kite")
SILVER = Instrument("NSE:SILVERBEES", "SILVERBEES", "NSE", "NIPPON INDIA SILVER ETF", "etf", "INR", "kite")
TCS_CAPS = Instrument("NSE:TCS", "TCS", "NSE", "TATA CONSULTANCY SERV LT", "stock", "INR", "kite")
ALL = (TCS_CAPS, GOLDBEES, EPAM, GOLD, GOLDM, SGB, GOLDMF, HDFCGOLD, SILVER)

THU_8PM_IST = datetime(2026, 11, 26, 14, 30, tzinfo=UTC)  # Thanksgiving, NSE shut for the day, US shut for the holiday
FRI_NSE_OPEN = datetime(2026, 11, 27, 3, 45, tzinfo=UTC)  # Fri 9:15 AM IST
FRI_US_OPEN = datetime(2026, 11, 27, 14, 30, tzinfo=UTC)  # Fri 9:30 AM New York = 8:00 PM IST


@pytest.fixture
def mk():
    return FakeMarket(instruments_={i.key: i for i in ALL}, heartbeat_at=NOW - timedelta(seconds=30))


@pytest.fixture
def c(env, mk):
    env.role = "admin"
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: mk
    app_mod.app.dependency_overrides[app_mod.get_user_role] = lambda: env.role
    return TestClient(app_mod.app)


# ---------- AC-10.6: gold types ----------
@pytest.mark.parametrize(
    ("inst", "category"),
    [
        (GOLD, "gold_spot"),
        (GOLDM, "gold_india"),
        (GOLDMF, "gold_mf"),
        (SGB, "gold_bond"),
        (Instrument("BSE:SGB2.5FEB28", "SGB2.5FEB28", "BSE", "SGB 2.50% FEB 2028", "bond", "INR", "kite"), "gold_bond"),
        (GOLDBEES, "gold_etf"),
        (HDFCGOLD, "gold_etf"),
        (SILVER, "etf"),
        (Instrument("NSE:NIFTYBEES", "NIFTYBEES", "NSE", "NIPPON INDIA ETF NIFTY BEES", "etf", "INR", "kite"), "etf"),
        (Instrument("US:GS", "GS", "US", "Goldman Sachs Group Inc", "stock", "USD", "finnhub"), "stock"),
        (TCS, "stock"),
        (EPAM, "stock"),
    ],
)
def test_ac_10_6_category_is_worked_out_when_the_gateway_has_none(inst, category):
    """AC-10.6: without `instruments.category` the kind comes from the key, symbol and name."""
    assert names.category_of(inst.key, inst.symbol, inst.name, inst.type, inst.category) == category


def test_ac_10_6_the_gateways_category_wins():
    """AC-10.6: a category set by the gateway is used as it is; an unknown or empty one is worked out instead."""
    assert names.category_of("NSE:XYZ", "XYZ", "XYZ LTD", "stock", "gold_etf") == "gold_etf"
    assert names.category_of("NSE:GOLDBEES", "GOLDBEES", "Gold BeES", "etf", "") == "gold_etf"
    assert names.category_of("NSE:GOLDBEES", "GOLDBEES", "Gold BeES", "etf", "nonsense") == "gold_etf"


def test_ac_10_6_and_10_2_items_carry_kind_and_group(c, mk):
    """AC-10.2, AC-10.6: each price item says its kind, its group (Gold, Indian shares, US shares) and whose hours it follows."""
    got = {
        i["key"]: i
        for i in c.get("/api/market/prices", params={"keys": "NSE:TCS,US:EPAM,GOLD:XAU_USD,MF:119132,NSE:SILVERBEES"}).json()["items"]
    }
    assert {k: (v["category"], v["group"], v["market"]) for k, v in got.items()} == {
        "NSE:TCS": ("stock", "india", "NSE"),
        "US:EPAM": ("stock", "us", "US"),
        "GOLD:XAU_USD": ("gold_spot", "gold", "GOLD"),
        "MF:119132": ("gold_mf", "gold", "AMFI"),
        "NSE:SILVERBEES": ("etf", "india", "NSE"),
    }


# ---------- AC-10.10 and AC-10.1: names ----------
@pytest.mark.parametrize(
    ("key", "raw", "shown"),
    [
        ("NSE:TCS", "TATA CONSULTANCY SERV LT", "Tata Consultancy Services"),
        ("NSE:TCS2", "TATA CONSULTANCY SERV LT", "Tata Consultancy Services"),  # not in the list: title case
        ("NSE:GOLDBEES", "NIPPON INDIA ETF GOLD BEES", "Nippon India ETF Gold BeES"),
        ("NSE:XGOLD", "NIPPON INDIA ETF GOLD BEES", "Nippon India ETF Gold BeES"),
        ("NSE:ABC", "HDFC ASSET MANAGEMENT CO LTD", "HDFC Asset Management Co"),
        ("NSE:SBIX", "STATE BANK OF INDIA", "State Bank of India"),
        ("NSE:SGBJUN31I-GB", "SGBJUN31I", "SGBJUN31I"),
        ("MF:1", "HDFC Gold ETF Fund of Fund - Direct Plan", "HDFC Gold ETF Fund of Fund - Direct Plan"),  # mixed case stays
        ("US:EPAM", "EPAM Systems Inc", "EPAM Systems Inc"),
        ("MCX:GOLDM", "GOLD MINI", "Gold rate, India"),
        ("NSE:LIC", "LIFE INSURA CORP OF INDIA", "Life Insura Corp of India"),
    ],
)
def test_ac_10_10_tidy_names(key, raw, shown):
    """AC-10.10: a short-name list for common items, title case for other all-capital names, ETF, NSE, SGB kept in capitals."""
    assert names.display_name(key, raw) == shown


def test_ac_10_1_short_names_for_the_strip(c):
    """AC-10.1: short names for the strip: TCS, Gold India, Gold BeES, the SGB series, a short fund name."""
    keys = "NSE:TCS,MCX:GOLDM,NSE:GOLDBEES,NSE:SGBJUN31I-GB,MF:119132,US:EPAM,GOLD:XAU_USD"
    got = {i["key"]: (i["display_name"], i["short_name"]) for i in c.get("/api/market/prices", params={"keys": keys}).json()["items"]}
    assert got["NSE:TCS"] == ("Tata Consultancy Services", "TCS")
    assert got["MCX:GOLDM"] == ("Gold rate, India", "Gold India")
    assert got["NSE:GOLDBEES"][1] == "Gold BeES"
    assert got["NSE:SGBJUN31I-GB"][1] == "SGBJUN31I"
    assert got["MF:119132"][1] == "HDFC Gold FoF"
    assert got["US:EPAM"][1] == "EPAM" and got["GOLD:XAU_USD"][1] == "Gold spot"
    assert all(len(s) <= 18 for _, s in got.values())


# ---------- AC-10.5: the Add sheet's search ----------
def test_ac_10_5_searching_gold_lists_every_gold_type(c):
    """AC-10.5: "gold" finds all five kinds, the bond too (its name doesn't say gold); not silver."""
    got = c.get("/api/market/search", params={"q": "gold"}).json()
    assert {i["category"] for i in got} == {"gold_india", "gold_spot", "gold_etf", "gold_bond", "gold_mf"}
    assert "NSE:SILVERBEES" not in {i["key"] for i in got}
    assert next(i for i in got if i["key"] == "MCX:GOLDM")["display_name"] == "Gold rate, India"


def test_ac_10_5_filter_chips_and_gold_with_nothing_typed(c):
    """AC-10.5: `group` keeps one group; choosing Gold with nothing typed lists the gold types; other chips need a word."""
    assert [i["key"] for i in c.get("/api/market/search", params={"q": "e", "group": "us"}).json()] == ["US:EPAM"]
    india = c.get("/api/market/search", params={"q": "nippon", "group": "india"}).json()
    assert [i["key"] for i in india] == ["NSE:SILVERBEES"]
    assert {i["group"] for i in c.get("/api/market/search", params={"group": "gold"}).json()} == {"gold"}
    assert c.get("/api/market/search", params={"group": "india"}).json() == []


def test_ac_10_5_twenty_results_keep_the_kinds_apart(env):
    """AC-9.1, AC-10.5: with more than 20 matches, the kinds take turns, so 30 gold funds can't push out the bond or the rate."""
    many = {
        f"MF:{n}": Instrument(f"MF:{n}", str(n), "AMFI", f"Fund {n} Gold Savings", "mutual_fund", "INR", "amfi") for n in range(100, 130)
    }
    m = FakeMarket(instruments_={**many, **{i.key: i for i in ALL}})
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: m
    app_mod.app.dependency_overrides[app_mod.get_user_role] = lambda: "admin"
    got = TestClient(app_mod.app).get("/api/market/search", params={"q": "gold"}).json()
    assert len(got) == 20
    assert {"gold_india", "gold_spot", "gold_etf", "gold_bond", "gold_mf"} <= {i["category"] for i in got}


@pytest.mark.parametrize("role", ["user", None])
def test_ac_9_8_india_gold_rate_and_bonds_are_founder_only(c, env, role):
    """AC-9.8 (with CR-0006): the India gold rate and Sovereign Gold Bonds come from Zerodha, so only the founder sees them."""
    env.role = role
    got = {i["key"] for i in c.get("/api/market/search", params={"q": "gold"}).json()}
    assert got == {"GOLD:XAU_USD", "MF:119132"}
    r = c.post("/api/market/watch", json={"keys": ["MCX:GOLDM", "NSE:SGBJUN31I-GB", "MF:119132"]}).json()
    assert r["watched"] == ["MF:119132"]


# ---------- AC-10.9: the market calendar ----------
def cal(market_, state, *, opens=None, closes=None, next_open=None, next_close=None, note=None) -> CalendarRow:
    return CalendarRow(market_, state, opens, closes, next_open, next_close, note, NOW)


def test_ac_10_9_clock_fallback_knows_the_next_opening():
    """AC-10.9: without the gateway's calendar, Distill's own hours: Thursday 8 PM IST, NSE next opens Friday 9:15 AM IST."""
    nse = hours.clock("NSE", THU_8PM_IST)
    assert (nse.state, nse.next_open_at, nse.source) == ("closed", "2026-11-27T03:45:00Z", "clock")
    us = hours.clock("US", THU_8PM_IST)  # the clock doesn't know Thanksgiving: 9:30 AM New York is open by the clock
    assert us.state == "open" and us.next_close_at == "2026-11-26T21:00:00Z"
    sat = datetime(2026, 11, 28, 6, 0, tzinfo=UTC)
    assert hours.clock("NSE", sat).next_open_at == "2026-11-30T03:45:00Z"  # Monday
    # gold spot follows the gateway's passes: open while NSE or the US market is open, so a quiet evening isn't a fault
    assert hours.clock("GOLD", sat).state == "closed" and hours.clock("GOLD", THU_8PM_IST).state == "open"  # US open by the clock
    evening = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)  # 5:30 PM IST: NSE shut, New York not open yet
    assert (hours.clock("GOLD", evening).state, hours.clock("GOLD", evening).next_open_at) == ("closed", "2026-11-26T14:30:00Z")
    mcx_winter = hours.clock("MCX", datetime(2026, 11, 26, 18, 0, tzinfo=UTC))  # 11:30 PM IST, New York on standard time
    assert mcx_winter.state == "open" and mcx_winter.next_close_at == "2026-11-26T18:25:00Z"
    mcx_summer = hours.clock("MCX", datetime(2026, 7, 1, 18, 0, tzinfo=UTC))
    assert mcx_summer.state == "closed"  # 11:30 PM IST while New York is on daylight saving time


def test_ac_10_9_gateway_calendar_is_used_when_it_fits(c, mk):
    """AC-10.9: the gateway's row (here: US closed for Thanksgiving) wins over the clock, and is flagged as a holiday."""
    app_mod.now = lambda: THU_8PM_IST
    mk.heartbeat_at = THU_8PM_IST - timedelta(hours=5)
    mk.calendar_ = [
        cal("US", "closed", next_open=FRI_US_OPEN, next_close=FRI_US_OPEN + timedelta(hours=3, minutes=30), note="Thanksgiving Day"),
        cal("NSE", "closed", opens=None, next_open=FRI_NSE_OPEN),
    ]
    got = c.get("/api/market/prices", params={"keys": "US:EPAM,NSE:TCS"}).json()
    us, nse = got["markets"]["US"], got["markets"]["NSE"]
    assert (us["state"], us["source"], us["holiday"], us["note"], us["next_open_at"]) == (
        "closed",
        "gateway",
        True,
        "Thanksgiving Day",
        "2026-11-27T14:30:00Z",
    )
    assert (nse["state"], nse["holiday"]) == ("closed", False)
    assert got["gateway"]["paused"] is True  # quiet, but nothing watched is open, so the app stays calm (AC-10.8)


def test_ac_10_9_a_stale_row_is_replaced_by_the_clock(c, mk):
    """AC-10.9: "open" left behind by the gateway's last pass on Friday doesn't make Saturday look open."""
    sat = datetime(2026, 11, 28, 6, 0, tzinfo=UTC)
    app_mod.now = lambda: sat
    fri_close = datetime(2026, 11, 27, 10, 0, tzinfo=UTC)
    mk.calendar_ = [cal("NSE", "open", opens=FRI_NSE_OPEN, closes=fri_close, next_close=fri_close)]
    nse = c.get("/api/market/prices", params={"keys": "NSE:TCS"}).json()["markets"]["NSE"]
    assert (nse["state"], nse["source"], nse["next_open_at"]) == ("closed", "clock", "2026-11-30T03:45:00Z")
    assert hours.fits(cal("NSE", "closed", next_open=fri_close), sat) is False
    assert hours.fits(cal("NSE", "weird"), sat) is False


def test_ac_10_9_works_with_the_gateway_as_released(c, mk):
    """AC-10.9: no calendar table (gateway v0.1.0): every watched market comes from the clock; gold funds have no market hours."""
    mk.calendar_ = None
    got = c.get("/api/market/prices", params={"keys": "NSE:TCS,US:EPAM,MF:119132"}).json()
    assert set(got["markets"]) == {"NSE", "US"} and {m["source"] for m in got["markets"].values()} == {"clock"}


# ---------- AC-10.3, AC-10.11, AC-10.12: watchlist version 2 ----------
def put(client, **watchlist):
    return client.put("/api/me/state", json={"watchlist": watchlist})


def test_ac_10_3_pins_kept_in_the_account_newer_wins(client):
    """AC-10.3: pins and their order are kept with the watchlist; the newer change wins; at most 6; only items in the list."""
    keys = ["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"]
    r = put(client, keys=keys, pinned=["GOLD:XAU_USD", "NSE:TCS", "US:NOTINLIST"], version=2, updated_at="2026-11-25T08:00:00Z")
    assert r.json()["state"]["watchlist"]["pinned"] == ["GOLD:XAU_USD", "NSE:TCS"]
    put(client, keys=keys, pinned=["US:EPAM"], version=2, updated_at="2026-11-25T07:00:00Z")  # older: loses
    assert client.get("/api/me/state").json()["state"]["watchlist"]["pinned"] == ["GOLD:XAU_USD", "NSE:TCS"]
    seven = [f"US:A{n}" for n in range(7)]
    assert put(client, keys=seven, pinned=seven, version=2, updated_at="2026-11-25T09:00:00Z").status_code == 422


def test_ac_10_11_strip_setting_kept_in_the_account(client):
    """AC-10.11: Every screen (default), Feed only or Off, kept with the watchlist; anything else is refused."""
    assert upgrade_watchlist(Watchlist()).strip == "every"
    r = put(client, keys=["US:EPAM"], pinned=[], strip="feed", version=2, updated_at="2026-11-25T08:00:00Z")
    assert r.json()["state"]["watchlist"]["strip"] == "feed"
    put(client, keys=["US:EPAM"], pinned=[], strip="off", version=2, updated_at="2026-11-25T08:05:00Z")
    assert client.get("/api/me/state").json()["state"]["watchlist"]["strip"] == "off"
    assert put(client, keys=[], strip="sometimes", updated_at="2026-11-25T08:06:00Z").status_code == 422


V040_WATCHLIST = {
    "keys": ["NSE:TCS", "US:EPAM", "GOLD:XAU_USD", "NSE:GOLDBEES", "US:A1", "US:A2", "US:A3"],
    "updated_at": "2026-11-26T08:00:00Z",
}
V040_STATE = {
    "version": 1, "topics": {"sections": ["finance"], "keywords": [], "updated_at": "2026-11-26T07:00:00Z"}, "cards": [],
    "settings": {"last_refreshed_at": None, "theme": "system"}, "watchlist": V040_WATCHLIST, "updated_at": "2026-11-26T08:00:00Z",
}  # fmt: skip


def test_ac_10_12_v040_account_copy_is_upgraded(client, env):
    """AC-10.12: an account copy saved by v0.4.0 loads with its first 6 items pinned and the strip on every screen."""
    env.store.rows["u_test"] = json.dumps(V040_STATE)  # exactly as v0.4.0 wrote it
    w = client.get("/api/me/state").json()["state"]["watchlist"]
    assert w["keys"] == V040_WATCHLIST["keys"] and w["more"] == []
    assert w["pinned"] == V040_WATCHLIST["keys"][:6] and w["strip"] == "every" and w["version"] == 2


def test_ac_10_12_a_v040_device_cant_wipe_the_new_fields(client):
    """AC-10.12: a newer change from a device on v0.4.0 (keys only) keeps items 11 to 20, pins and the strip setting."""
    every = [f"US:A{n:02d}" for n in range(14)]
    put(client, keys=every[:10], more=every[10:], pinned=["US:A12", "US:A01"], strip="off", version=2, updated_at="2026-11-26T08:00:00Z")
    old_device = {**V040_STATE, "watchlist": {"keys": ["US:A01", "US:A00", "US:A02"], "updated_at": "2026-11-26T09:00:00Z"}}
    w = client.put("/api/me/state", json=old_device).json()["state"]["watchlist"]
    # its change to the 10 items it shows wins; the items it never saw (11 to 20), the pins and the setting stay
    assert [*w["keys"], *w["more"]] == ["US:A01", "US:A00", "US:A02", *every[10:]]
    assert w["pinned"] == ["US:A12", "US:A01"] and w["strip"] == "off"
    merged = merge_states(UserState(watchlist=Watchlist(keys=["US:A01"], pinned=["US:A01"], strip="feed", version=2,
                          updated_at="2026-11-26T08:00:00Z")), UserState.model_validate(V040_STATE), NOW)  # fmt: skip
    assert merged.watchlist.keys == V040_WATCHLIST["keys"] and merged.watchlist.strip == "feed"


def test_ac_10_12_v050_copy_stays_readable_by_v040(client):
    """AC-10.12: a copy saved by v0.5.0 with 20 items still validates as v0.4.0's watchlist (10 keys at most), so a rollback is safe."""

    class WatchlistV040(BaseModel):  # the v0.4.0 model, as released
        keys: list[str] = Field(default_factory=list, max_length=10)
        updated_at: str | None = None

    every = [f"US:A{n:02d}" for n in range(20)]
    saved = put(client, keys=every[:10], more=every[10:], pinned=every[:6], strip="feed", version=2, updated_at="2026-11-26T08:00:00Z")
    old = WatchlistV040.model_validate(saved.json()["state"]["watchlist"])
    assert old.keys == every[:10]


def test_ac_10_12_migration_tidies_any_copy():
    """AC-10.12: the migration drops repeats, keeps at most 20 items, and pins only items in the list."""
    w = upgrade_watchlist(Watchlist(keys=["A:1", "A:2", "A:1"], more=["A:2", "A:3"], pinned=["A:3", "B:9"]))
    assert (w.keys, w.more, w.pinned, w.version) == (["A:1", "A:2", "A:3"], [], ["A:3"], 2)


# ---------- the real SQL: the gateway as released, and with its change E1 ----------
E1_DDL = """
alter table market.instruments add column category text;
create table market.market_calendar (market text primary key, state text not null, session_opens timestamptz, session_closes timestamptz,
  next_open_at timestamptz, next_close_at timestamptz, note text, updated_at timestamptz not null default now());
grant select on market.market_calendar to distill_app_test;
"""


def _load(conn, instruments, *, with_category: bool) -> None:
    for i in instruments:
        cols = "key, symbol, exchange, name, type, currency, source" + (", category" if with_category else "")
        vals = (i.key, i.symbol, i.exchange, i.name, i.type, i.currency, i.source) + ((i.category,) if with_category else ())
        conn.execute(f"insert into market.instruments ({cols}) values ({', '.join(['%s'] * len(vals))})", vals)
    r = row("NSE:TCS", 4182.5)
    conn.execute("insert into market.prices values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                 (r.key, r.price, r.currency, r.prev_close, r.change, r.change_pct, r.as_of, r.fetched_at, r.market_state, r.delay, r.source, r.error))  # fmt: skip
    conn.execute("insert into market.gateway_status (id, heartbeat_at, sources) values (1, %s, '{}')", (NOW - timedelta(seconds=30),))


@pytest.fixture
def gateway_v010(pg_admin_url):
    import psycopg

    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute(CONTRACT_DDL)
        _load(conn, (TCS_CAPS, GOLDBEES, EPAM, GOLD, SGB, GOLDMF), with_category=False)
    return pg_admin_url.replace("postgresql://postgres@", "postgresql://distill_app_test@")


@pytest.fixture
def gateway_e1(pg_admin_url):
    from dataclasses import replace

    import psycopg

    plain = (TCS_CAPS, GOLDBEES, EPAM, GOLD, GOLDM, SGB, GOLDMF)
    tagged = [replace(i, category=names.category_of(i.key, i.symbol, i.name, i.type)) for i in plain]
    tagged.append(Instrument("NSE:ODDGOLD", "ODDGOLD", "NSE", "ODD NAME", "etf", "INR", "kite", "gold_etf"))  # only the column says gold
    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute(CONTRACT_DDL)
        conn.execute(E1_DDL)
        _load(conn, tagged, with_category=True)
        conn.execute(
            "insert into market.market_calendar (market, state, next_open_at, note) values ('US', 'closed', %s, 'Thanksgiving Day')",
            (FRI_US_OPEN,),
        )
    return pg_admin_url.replace("postgresql://postgres@", "postgresql://distill_app_test@")


async def test_ac_10_9_postgres_against_the_gateway_as_released(gateway_v010):
    """AC-10.6, AC-10.9: against gateway v0.1.0 (no category, no calendar) search, prices and the clock fallback all work."""
    pm = market.PostgresMarket(gateway_v010)
    found = {i.key for i in await pm.search("gold", include_kite=True, gold=True)}
    assert {"NSE:GOLDBEES", "GOLD:XAU_USD", "NSE:SGBJUN31I-GB", "MF:119132"} <= found  # the bond found by its SGB symbol
    snap = await pm.snapshot(["NSE:TCS"])
    assert snap.calendar is None and float(snap.rows["NSE:TCS"].price) == 4182.5
    assert pm.features.category is False and pm.features.calendar is False
    out = await market.prices(pm, ["NSE:TCS", "NSE:SGBJUN31I-GB"], "admin", NOW)
    assert [(i.display_name, i.category) for i in out.items] == [("Tata Consultancy Services", "stock"), ("SGBJUN31I", "gold_bond")]
    assert out.markets["NSE"].source == "clock"


async def test_ac_10_9_postgres_against_the_gateway_with_e1(gateway_e1):
    """AC-10.6, AC-10.9: with E1 the gateway's category column and calendar are read (as the app role) and used."""
    pm = market.PostgresMarket(gateway_e1)
    found = {i.key: i for i in await pm.search("odd", include_kite=True)}
    assert found["NSE:ODDGOLD"].category == "gold_etf"
    assert "NSE:ODDGOLD" in {i.key for i in await pm.search("gold", include_kite=True, gold=True)}  # gold by its column alone
    out = await market.prices(pm, ["US:EPAM", "MCX:GOLDM"], "admin", THU_8PM_IST)
    assert (out.markets["US"].source, out.markets["US"].holiday) == ("gateway", True)
    assert out.markets["MCX"].source == "clock"  # no MCX row yet
    assert {i.key: i.category for i in out.items} == {"US:EPAM": "stock", "MCX:GOLDM": "gold_india"}
