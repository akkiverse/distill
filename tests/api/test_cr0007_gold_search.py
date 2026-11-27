"""CR-0007 (B6): the gold search keeps the India gold rate and gold spot, however many bonds, ETFs and funds also
match "gold". A fake market and, where Postgres is installed, a throwaway database shaped like the gateway as
released (v0.1.0). Nothing real is called."""

from __future__ import annotations

import asyncio

import pytest
from distill import app as app_mod
from distill import market
from distill.market import FakeMarket, Instrument
from fastapi.testclient import TestClient
from test_us9_watchlist import CONTRACT_DDL, GOLD, GOLDBEES
from test_us10_watchlist_strip import GOLDM, _load

# What the real gateway holds: 120 Sovereign Gold Bond series, 60 gold fund plans and 30 gold ETFs all say "gold",
# and every one of them sorts before "XAU" (gold spot) by symbol.
SGBS = [Instrument(f"NSE:SGB{n:03d}-GB", f"SGB{n:03d}-GB", "NSE", f"SGB SERIES {n}", "bond", "INR", "kite") for n in range(120)]
FUNDS = [
    Instrument(f"MF:{n}", str(n), "AMFI", f"Fund {n} Gold Savings - Direct Plan", "mutual_fund", "INR", "amfi")
    for n in range(100000, 100060)
]
ETFS = [Instrument(f"NSE:AGOLD{n:02d}", f"AGOLD{n:02d}", "NSE", f"A{n} GOLD ETF", "etf", "INR", "kite") for n in range(30)]
CROWD = (*SGBS, *FUNDS, *ETFS)


def client(env, instruments, role: str | None) -> TestClient:
    env.role = role
    m = FakeMarket(instruments_={i.key: i for i in instruments})
    app_mod.app.dependency_overrides[app_mod.get_market] = lambda: m
    app_mod.app.dependency_overrides[app_mod.get_user_role] = lambda: env.role
    return TestClient(app_mod.app)


def keys(c: TestClient, **params) -> list[str]:
    return [i["key"] for i in c.get("/api/market/search", params=params).json()]


def test_ac_10_13_gold_spot_and_india_rate_survive_a_crowd_of_matches(env):
    """AC-10.13: with 210 other gold rows, "gold" still lists the India gold rate and gold spot (and every other kind)."""
    c = client(env, (*CROWD, GOLD, GOLDM, GOLDBEES), "admin")
    got = c.get("/api/market/search", params={"q": "gold"}).json()
    assert len(got) == 20
    assert {"MCX:GOLDM", "GOLD:XAU_USD"} <= {i["key"] for i in got}
    assert {"gold_india", "gold_spot", "gold_etf", "gold_bond", "gold_mf"} <= {i["category"] for i in got}
    assert keys(c, group="gold")[:2] == ["MCX:GOLDM", "GOLD:XAU_USD"]  # the Gold chip with nothing typed


def test_ac_10_13_everyone_else_still_gets_gold_spot_but_not_the_zerodha_rate(env):
    """AC-10.13 with AC-9.8: for a signed-in user (or sign-in off) gold spot survives the crowd; the India rate stays founder-only."""
    for role in ("user", None):
        got = keys(client(env, (*CROWD, GOLD, GOLDM), role), q="gold")
        assert "GOLD:XAU_USD" in got
        assert "MCX:GOLDM" not in got
        assert not any(k.endswith("-GB") for k in got)


def test_ac_10_13_fixed_rows_only_when_the_words_fit(env):
    """AC-10.13: the fixed rows join only when every word typed is in their names: "gold rate" yes, "goldbees" or "sgb" no."""
    c = client(env, (*CROWD, GOLD, GOLDM, GOLDBEES), "admin")
    rate = keys(c, q="gold rate")
    assert "MCX:GOLDM" in rate and "GOLD:XAU_USD" not in rate
    assert "GOLD:XAU_USD" in keys(c, q="gold spot")
    bees = keys(c, q="goldbees")
    assert bees[0] == "NSE:GOLDBEES" and not {"MCX:GOLDM", "GOLD:XAU_USD"} & set(bees)
    assert not {"MCX:GOLDM", "GOLD:XAU_USD"} & set(keys(c, q="sgb"))
    assert keys(c, q="tcs") == []  # not a gold search: no fixed rows, no lookup


def test_ac_10_13_an_exact_symbol_match_still_leads(env):
    """AC-10.13 with AC-9.1: typing a symbol exactly puts it first, ahead of the fixed rows."""
    big = Instrument("MCX:GOLD", "GOLD", "MCX", "GOLD", "commodity", "INR", "kite")
    got = keys(client(env, (*CROWD, GOLD, GOLDM, big), "admin"), q="gold")
    assert got[:3] == ["MCX:GOLD", "MCX:GOLDM", "GOLD:XAU_USD"]


def test_ac_10_13_missing_rows_are_simply_not_there(env):
    """AC-10.13: before the gateway has the India rate (or spot), the search works and lists what there is."""
    got = keys(client(env, (*CROWD, GOLD), "admin"), q="gold")
    assert got[0] == "GOLD:XAU_USD" and "MCX:GOLDM" not in got and len(got) == 20


def test_ac_10_13_bonds_come_after_the_other_gold_rows():
    """AC-10.13: the rows read for a gold search put Sovereign Gold Bonds last, so ETFs and funds aren't pushed out."""
    m = FakeMarket(instruments_={i.key: i for i in CROWD})
    found = asyncio.run(m.search("gold", include_kite=True, limit=market.SEARCH_FETCH, gold=True))
    assert len(found) == market.SEARCH_FETCH
    assert {i.key for i in ETFS} <= {i.key for i in found}
    assert found[-1].symbol.startswith("SGB")


@pytest.fixture
def gateway_crowded(pg_admin_url):
    import psycopg

    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute(CONTRACT_DDL)
        _load(conn, (*CROWD, GOLD, GOLDM, GOLDBEES), with_category=False)
    return pg_admin_url.replace("postgresql://postgres@", "postgresql://distill_app_test@")


async def test_ac_10_13_postgres_crowded_gateway(gateway_crowded):
    """AC-10.13 against the real SQL (gateway v0.1.0 shape): the rate and spot are found by key; bonds sort last."""
    pm = market.PostgresMarket(gateway_crowded)
    rows = await pm.search("gold", include_kite=True, limit=market.SEARCH_FETCH, gold=True)
    assert len(rows) == market.SEARCH_FETCH and rows[-1].symbol.startswith("SGB")
    assert {i.key for i in ETFS} <= {i.key for i in rows}
    got = [i.key for i in await market.search(pm, "gold", "admin")]
    assert {"MCX:GOLDM", "GOLD:XAU_USD"} <= set(got) and len(got) == 20
    assert "MCX:GOLDM" not in [i.key for i in await market.search(pm, "gold", "user")]
