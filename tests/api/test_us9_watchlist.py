"""US-9: price watchlist from the shared market database (CR-0005). A fake market and, where Postgres is installed, a
throwaway database shaped like the market data contract with the contract's limited `app` role. Nothing real is called."""

from __future__ import annotations

import ast
import pathlib
from datetime import timedelta

import pytest
from conftest import NOW
from distill import app as app_mod
from distill import market
from distill.market import FakeMarket, Instrument, PriceRow
from distill.models import UserState, Watchlist
from distill.rules import merge_states
from fastapi.testclient import TestClient

TCS = Instrument("NSE:TCS", "TCS", "NSE", "Tata Consultancy Services", "stock", "INR", "kite")
GOLDBEES = Instrument("NSE:GOLDBEES", "GOLDBEES", "NSE", "Nippon India ETF Gold BeES", "etf", "INR", "kite")
EPAM = Instrument("US:EPAM", "EPAM", "US", "EPAM Systems", "stock", "USD", "finnhub")
GOLD = Instrument("GOLD:XAU_USD", "XAU", "SPOT", "Gold spot", "commodity", "USD", "metalcharts")
TCSX = Instrument("US:TCSX", "TCSX", "US", "Example TCS Holdings", "stock", "USD", "finnhub")


def row(key, price, *, prev=None, delay="live", state="open", src="kite", error=None, minutes_ago=1.0, currency="INR") -> PriceRow:
    prev = price - 10 if prev is None and price is not None else prev
    change = None if price is None else round(price - prev, 2)
    pct = None if price is None else round(change / prev * 100, 2)
    at = NOW - timedelta(minutes=minutes_ago)
    return PriceRow(key, price, currency, prev, change, pct, at, at, state, delay, src, error)


@pytest.fixture
def mk():
    m = FakeMarket(instruments_={i.key: i for i in (TCS, GOLDBEES, EPAM, GOLD, TCSX)}, heartbeat_at=NOW - timedelta(seconds=40))
    m.prices_ = {
        "NSE:TCS": row("NSE:TCS", 4182.5),
        "US:EPAM": row("US:EPAM", 185.2, prev=190.0, delay="15min", src="finnhub", currency="USD"),
        "GOLD:XAU_USD": row("GOLD:XAU_USD", 2650.0, state="closed", src="metalcharts", currency="USD"),
    }
    return m


@pytest.fixture
def mclient(env, mk):
    """The API with the fake market; `env.role` is the person's Studio Accounts role."""
    env.role = "admin"
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: mk
    app_mod.app.dependency_overrides[app_mod.get_user_role] = lambda: env.role
    return TestClient(app_mod.app)


def test_ac_9_1_search_by_symbol_or_name(mclient, env):
    """AC-9.1: up to 20 matches by symbol or name, exact symbol first, with name, symbol and exchange."""
    got = mclient.get("/api/market/search", params={"q": "tcs"}).json()
    assert [i["key"] for i in got] == ["NSE:TCS", "US:TCSX"]
    assert {"name", "symbol", "exchange"} <= set(got[0])
    assert [i["key"] for i in mclient.get("/api/market/search", params={"q": "gold"}).json()] == ["NSE:GOLDBEES", "GOLD:XAU_USD"]
    assert mclient.get("/api/market/search", params={"q": "  "}).json() == []


def test_ac_9_1_search_is_capped_at_20(env):
    """AC-9.1: never more than 20 results."""
    many = {f"US:A{n:02d}": Instrument(f"US:A{n:02d}", f"A{n:02d}", "US", f"Alpha {n}", "stock", "USD", "finnhub") for n in range(30)}
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: FakeMarket(instruments_=many)
    app_mod.app.dependency_overrides[app_mod.get_user_role] = lambda: "admin"
    assert len(TestClient(app_mod.app).get("/api/market/search", params={"q": "a"}).json()) == 20


def test_ac_9_2_watchlist_kept_in_account_newer_wins(client, env):
    """AC-9.2: the watchlist is kept with topics in the account and the newer change wins."""
    first = UserState(watchlist=Watchlist(keys=["NSE:TCS"], updated_at="2026-11-25T08:00:00Z"))
    assert client.put("/api/me/state", json=first.model_dump(mode="json")).json()["state"]["watchlist"]["keys"] == ["NSE:TCS"]
    newer = UserState(watchlist=Watchlist(keys=["US:EPAM", "NSE:TCS"], updated_at="2026-11-25T08:30:00Z"))
    client.put("/api/me/state", json=newer.model_dump(mode="json"))
    older = UserState(watchlist=Watchlist(keys=["GOLD:XAU_USD"], updated_at="2026-11-25T07:00:00Z"))
    got = client.put("/api/me/state", json=older.model_dump(mode="json")).json()["state"]["watchlist"]
    assert got["keys"] == ["US:EPAM", "NSE:TCS"]


def test_ac_9_2_eleventh_item_is_refused(mclient):
    """AC-9.2: at most 10 items; an 11th is refused with a plain message."""
    keys = [f"US:A{n:02d}" for n in range(11)]
    r = mclient.post("/api/market/watch", json={"keys": keys})
    assert r.status_code == 422 and r.json()["error"]["message"] == "You can watch up to 10 items."
    r = mclient.put("/api/me/state", json={"watchlist": {"keys": keys, "updated_at": "2026-11-25T08:00:00Z"}})
    assert r.status_code == 422


def test_ac_9_3_adding_or_opening_upserts_watch_symbols(mclient, mk):
    """AC-9.3: keys are upserted into market.watch_symbols with last_wanted_at = now; first_wanted_at is kept."""
    r = mclient.post("/api/market/watch", json={"keys": ["NSE:TCS", "US:EPAM"]}).json()
    assert r == {"watched": ["NSE:TCS", "US:EPAM"], "refused": []}
    assert mk.watch_symbols["NSE:TCS"] == (NOW, NOW)
    later = NOW + timedelta(minutes=5)
    app_mod.now = lambda: later
    mclient.post("/api/market/watch", json={"keys": ["NSE:TCS"]})
    assert mk.watch_symbols["NSE:TCS"] == (NOW, later)


def test_ac_9_3_unknown_keys_are_not_watched(mclient, mk):
    """AC-9.3: only known instruments reach watch_symbols."""
    r = mclient.post("/api/market/watch", json={"keys": ["NSE:NOPE", "bad key", "US:EPAM"]}).json()
    assert r["watched"] == ["US:EPAM"] and set(r["refused"]) == {"NSE:NOPE", "bad key"}
    assert set(mk.watch_symbols) == {"US:EPAM"}


def test_ac_9_4_price_change_and_time(mclient):
    """AC-9.4: price with currency, change and %, and the source time (as_of, UTC) for the Indian-time label."""
    got = mclient.get("/api/market/prices", params={"keys": "NSE:TCS,US:EPAM"}).json()
    tcs, epam = got["items"]
    assert (tcs["key"], tcs["name"], tcs["symbol"], tcs["currency"], tcs["price"]) == (
        "NSE:TCS",
        "Tata Consultancy Services",
        "TCS",
        "INR",
        4182.5,
    )
    assert tcs["change"] == 10.0 and tcs["change_pct"] == pytest.approx(0.24, abs=0.01)
    assert tcs["as_of"] == "2026-11-25T08:59:00Z"
    assert epam["change"] == -4.8 and epam["change_pct"] < 0 and epam["currency"] == "USD"


@pytest.mark.parametrize(
    ("delay", "state", "label"),
    [
        ("live", "open", "Live"),
        ("15min", "open", "Delayed 15 min"),
        ("15 min", "open", "Delayed 15 min"),
        ("live", "closed", "Market closed, last close"),
        ("15min", "closed", "Market closed, last close"),
        ("eod", "open", "End-of-day price"),
        ("live", "pre", "Pre-open, last close"),
    ],
)
def test_ac_9_5_labels(delay, state, label):
    """AC-9.5: Live, Delayed 15 min (or the delay given), Market closed, last close."""
    assert market.price_label(delay, state) == label


def test_ac_9_5_labels_reach_the_app(mclient):
    """AC-9.5: each item carries its label."""
    got = {i["key"]: i["label"] for i in mclient.get("/api/market/prices", params={"keys": "NSE:TCS,US:EPAM,GOLD:XAU_USD"}).json()["items"]}
    assert got == {"NSE:TCS": "Live", "US:EPAM": "Delayed 15 min", "GOLD:XAU_USD": "Market closed, last close"}


def test_ac_9_6_paused_after_two_minutes(mclient, mk):
    """AC-9.6: a heartbeat older than 2 minutes (or none) means paused; the last prices are still sent."""
    assert mclient.get("/api/market/prices", params={"keys": "NSE:TCS"}).json()["gateway"]["paused"] is False
    mk.heartbeat_at = NOW - timedelta(minutes=2, seconds=1)
    got = mclient.get("/api/market/prices", params={"keys": "NSE:TCS"}).json()
    assert got["gateway"] == {"heartbeat_at": "2026-11-25T08:57:59Z", "paused": True}
    assert got["items"][0]["price"] == 4182.5
    mk.heartbeat_at = None
    assert mclient.get("/api/market/prices", params={"keys": "NSE:TCS"}).json()["gateway"]["paused"] is True


def test_ac_9_7_waiting_and_error(mclient, mk):
    """AC-9.7: no price yet is "waiting"; an error keeps the last price with the reason."""
    mk.prices_["NSE:GOLDBEES"] = row("NSE:GOLDBEES", None, error=None)
    mk.prices_["NSE:TCS"] = row("NSE:TCS", 4182.5, error="Not logged in today")
    items = {i["key"]: i for i in mclient.get("/api/market/prices", params={"keys": "NSE:TCS,NSE:GOLDBEES,US:TCSX"}).json()["items"]}
    assert items["NSE:GOLDBEES"]["status"] == "waiting" and items["NSE:GOLDBEES"]["price"] is None
    assert items["US:TCSX"]["status"] == "waiting"  # no row at all yet
    assert (items["NSE:TCS"]["status"], items["NSE:TCS"]["price"], items["NSE:TCS"]["error"]) == ("error", 4182.5, "Not logged in today")


@pytest.mark.parametrize("role", ["user", None, ""])
def test_ac_9_8_zerodha_prices_for_the_founder_only(mclient, mk, env, role):
    """AC-9.8: anyone but the founder never gets Zerodha items in search, watch or prices."""
    env.role = role
    assert [i["key"] for i in mclient.get("/api/market/search", params={"q": "tcs"}).json()] == ["US:TCSX"]
    r = mclient.post("/api/market/watch", json={"keys": ["NSE:TCS", "US:EPAM"]}).json()
    assert r == {"watched": ["US:EPAM"], "refused": ["NSE:TCS"]} and "NSE:TCS" not in mk.watch_symbols
    got = mclient.get("/api/market/prices", params={"keys": "NSE:TCS,US:EPAM"})
    assert [i["key"] for i in got.json()["items"]] == ["US:EPAM"] and got.json()["hidden"] == ["NSE:TCS"]
    assert "4182" not in got.text


def test_ac_9_8_founder_sees_zerodha(mclient, env):
    """AC-9.8: the founder (role admin) sees them."""
    env.role = "admin"
    assert [i["key"] for i in mclient.get("/api/market/prices", params={"keys": "NSE:TCS"}).json()["items"]] == ["NSE:TCS"]


def test_ac_9_8_role_comes_from_studio_accounts(monkeypatch):
    """AC-9.8: the role is read from the signed-in Studio Accounts claims; signed out is not the founder."""
    from starlette.requests import Request

    req = Request({"type": "http", "headers": [], "path": "/"})
    monkeypatch.setattr(app_mod.studio_auth, "optional_user", lambda r: {"sub": "u1", "role": "admin"})
    assert app_mod.get_user_role(req) == "admin"
    monkeypatch.setattr(app_mod.studio_auth, "optional_user", lambda r: None)
    assert app_mod.get_user_role(req) is None


def test_ac_9_10_not_set_up_and_offline(env, monkeypatch):
    """AC-9.10: without MARKET_DATABASE_URL Prices says so; when it can't be reached, a plain message; the rest works."""
    monkeypatch.delenv("MARKET_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://never-used-for-market/x")
    assert market.live_market() is None
    c = TestClient(app_mod.app)
    for r in (c.get("/api/market/prices", params={"keys": "US:EPAM"}), c.get("/api/market/search", params={"q": "e"})):
        assert r.status_code == 409 and r.json()["error"] == {"code": "market_not_set_up", "message": "Price source not set up yet."}
    assert c.get("/api/health").json()["market_configured"] is False
    assert c.get("/api/sections").status_code == 200
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: FakeMarket(offline=True)
    r = c.get("/api/market/prices", params={"keys": "US:EPAM"})
    assert r.status_code == 503 and r.json()["error"]["message"] == "Prices can't be reached right now."


def test_ac_9_11_order_is_kept(client):
    """AC-9.11: removing and reordering keep the new order in the account."""

    def put(keys, at):
        r = client.put("/api/me/state", json={"watchlist": {"keys": keys, "updated_at": at}})
        return r.json()["state"]["watchlist"]["keys"]

    assert put(["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"], "2026-11-25T08:00:00Z") == ["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"]
    assert put(["GOLD:XAU_USD", "NSE:TCS"], "2026-11-25T08:01:00Z") == ["GOLD:XAU_USD", "NSE:TCS"]


def test_ac_9_13_market_url_is_its_own(monkeypatch):
    """AC-9.13: market tables use MARKET_DATABASE_URL, never DATABASE_URL."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://distill-own/db")
    monkeypatch.setenv("MARKET_DATABASE_URL", "postgresql://market/db")
    assert market.live_market().url == "postgresql://market/db"


def test_ac_9_13_only_watch_symbols_is_written():
    """AC-9.13: the market code names only the four contract tables, and its only write is to watch_symbols."""
    src = pathlib.Path(market.__file__).read_text()
    sql = [n.value for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Constant) and isinstance(n.value, str) and "market." in n.value]
    import re

    named = {m for s in sql for m in re.findall(r"market\.[a-z_]+", s)}
    assert named <= set(market.TABLES)
    writes = {t for s in sql for t in re.findall(r"(?:insert\s+into|update|delete\s+from)\s+(market\.[a-z_]+)", s, re.I)}
    assert writes == {"market.watch_symbols"}
    for other in pathlib.Path(market.__file__).parent.glob("*.py"):
        if other.name != "market.py":
            assert not re.search(r"(?:from|into|update|join)\s+market\.", other.read_text(), re.I), other.name


def test_compat_v030_copy_loads_with_empty_watchlist(client, env):
    """CR-0005: an account copy saved by v0.3.0 (no watchlist) reads unchanged, and a v0.3.0 device can't wipe the list."""
    import asyncio

    v030 = {"version": 1, "topics": {"sections": ["finance"], "keywords": ["gold rate"], "updated_at": "2026-11-25T07:00:00Z"},
            "cards": [], "settings": {"last_refreshed_at": None, "theme": "system"}, "updated_at": "2026-11-25T07:00:00Z"}  # fmt: skip
    env.store.rows["u_test"] = UserState.model_validate(v030).model_dump_json(exclude={"watchlist"})
    got = client.get("/api/me/state").json()["state"]
    assert got["topics"]["keywords"] == ["gold rate"] and got["watchlist"] == {"keys": [], "updated_at": None}
    asyncio.run(
        env.store.sync(
            "u_test", lambda s: s.model_copy(update={"watchlist": Watchlist(keys=["US:EPAM"], updated_at="2026-11-25T08:00:00Z")})
        )
    )
    after = client.put("/api/me/state", json=v030).json()["state"]
    assert after["watchlist"]["keys"] == ["US:EPAM"]
    merged = merge_states(
        UserState(watchlist=Watchlist(keys=["US:EPAM"], updated_at="2026-11-25T08:00:00Z")), UserState.model_validate(v030), NOW
    )
    assert merged.watchlist.keys == ["US:EPAM"] and merged.topics.keywords == ["gold rate"]


# ---------- the real SQL, against a database shaped like the contract, as the limited `app` role ----------
CONTRACT_DDL = """
drop schema if exists market cascade;
create schema market;
create table market.instruments (key text primary key, symbol text not null, exchange text not null, name text not null,
  type text not null, currency text not null, source text not null, updated_at timestamptz not null default now());
create table market.watch_symbols (key text primary key references market.instruments(key), first_wanted_at timestamptz not null,
  last_wanted_at timestamptz not null);
create table market.prices (key text primary key, price numeric, currency text, prev_close numeric, change numeric, change_pct numeric,
  as_of timestamptz, fetched_at timestamptz, market_state text, delay text, source text, error text);
create table market.gateway_status (id int primary key, heartbeat_at timestamptz, kite_session_until timestamptz, sources jsonb);
do $$ begin if not exists (select from pg_roles where rolname = 'distill_app_test') then create role distill_app_test login; end if; end $$;
grant usage on schema market to distill_app_test;
grant select on all tables in schema market to distill_app_test;
grant insert, update on market.watch_symbols to distill_app_test;
"""


@pytest.fixture
def app_role_url(pg_admin_url):
    import psycopg

    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute(CONTRACT_DDL)
        for i in (TCS, GOLDBEES, EPAM, GOLD, TCSX):
            conn.execute("insert into market.instruments (key, symbol, exchange, name, type, currency, source) values (%s,%s,%s,%s,%s,%s,%s)",
                         (i.key, i.symbol, i.exchange, i.name, i.type, i.currency, i.source))  # fmt: skip
        r = row("NSE:TCS", 4182.5)
        conn.execute("insert into market.prices values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                     (r.key, r.price, r.currency, r.prev_close, r.change, r.change_pct, r.as_of, r.fetched_at, r.market_state, r.delay, r.source, r.error))  # fmt: skip
        conn.execute("insert into market.gateway_status (id, heartbeat_at, sources) values (1, %s, '{}')", (NOW - timedelta(seconds=30),))
    return pg_admin_url.replace("postgresql://postgres@", "postgresql://distill_app_test@")


async def test_ac_9_13_postgres_market_works_as_the_app_role(app_role_url, pg_admin_url):
    """AC-9.1, AC-9.3, AC-9.4, AC-9.13: search, watch and prices run against the contract's tables with only the app role's rights."""
    import psycopg

    pm = market.PostgresMarket(app_role_url)
    assert [i.key for i in await pm.search("tcs", include_kite=True)] == ["NSE:TCS", "US:TCSX"]
    assert [i.key for i in await pm.search("tcs", include_kite=False)] == ["US:TCSX"]
    assert [i.key for i in await pm.search("50%_off", include_kite=True)] == []
    await pm.watch(["NSE:TCS", "US:EPAM"], NOW)
    await pm.watch(["NSE:TCS"], NOW + timedelta(minutes=3))
    with psycopg.connect(pg_admin_url) as conn:
        got = dict((k, (f, last)) for k, f, last in conn.execute("select key, first_wanted_at, last_wanted_at from market.watch_symbols"))
    assert got["NSE:TCS"] == (NOW, NOW + timedelta(minutes=3)) and got["US:EPAM"] == (NOW, NOW)
    rows, heartbeat = await pm.prices(["NSE:TCS", "US:EPAM"])
    assert set(rows) == {"NSE:TCS"} and float(rows["NSE:TCS"].price) == 4182.5 and heartbeat == NOW - timedelta(seconds=30)
    out = await market.prices(pm, ["NSE:TCS", "US:EPAM"], "admin", NOW)
    assert [(i.key, i.status) for i in out.items] == [("NSE:TCS", "ok"), ("US:EPAM", "waiting")] and out.gateway.paused is False
    # The app role can't write prices (and Distill never tries).
    with pytest.raises(psycopg.errors.InsufficientPrivilege), psycopg.connect(app_role_url) as conn:
        conn.execute("update market.prices set price = 1")


async def test_ac_9_10_unreachable_market_database():
    """AC-9.10: a market database that doesn't answer is reported as unavailable, never a crash."""
    pm = market.PostgresMarket("postgresql://nobody@127.0.0.1:9/none", connect_timeout=1)
    with pytest.raises(market.MarketUnavailable):
        await pm.prices(["US:EPAM"])
