"""US-7: Keep my topics and saved cards in my account (the account database, Postgres on Neon in production).

The database tests run against a throwaway local Postgres (see `pg_url` in conftest.py); nothing real is called.
"""

import asyncio
import json

import psycopg
import pytest
from conftest import NOW, card, iso
from distill import app as app_mod
from distill import store
from distill.models import UserState
from distill.rules import merge_states
from fastapi.testclient import TestClient


def dump(cards):
    return [c.model_dump() for c in cards]


def rows(url: str) -> dict[str, dict]:
    with psycopg.connect(url) as conn:
        return {uid: st for uid, st in conn.execute("select user_id, state from distill_user_state").fetchall()}


def test_ac_7_1_topics_and_cards_follow_the_person_to_another_device(client, env, pg_url):
    """AC-7.1: topics and a saved card sent from device A are in the account, and device B gets them on its next sync."""
    env.store = store.PostgresStore(pg_url)
    env.user_id = "u_akki"
    saved = card("c1", "Gold rate today", hours_ago=30, saved=True, saved_changed_at=iso(NOW))
    a = {"topics": {"sections": ["finance"], "keywords": ["gold rate"], "updated_at": iso(NOW)}, "cards": dump([saved]), "settings": {}}
    assert client.put("/api/me/state", json=a).status_code == 200

    stored = rows(pg_url)["u_akki"]
    assert stored["topics"]["keywords"] == ["gold rate"] and stored["cards"][0]["id"] == "c1"

    # device B: a fresh browser, nothing on it yet
    b = client.put("/api/me/state", json={"topics": {}, "cards": [], "settings": {}}).json()["state"]
    assert b["topics"]["sections"] == ["finance"] and b["topics"]["keywords"] == ["gold rate"]
    assert [c["id"] for c in b["cards"] if c["saved"]] == ["c1"]
    assert client.get("/api/me/state").json()["state"]["cards"][0]["saved"] is True

    # another person's account stays separate
    env.user_id = "u_other"
    assert client.get("/api/me/state").json()["state"]["cards"] == []


def test_ac_7_2_table_is_created_when_missing(client, env, pg_admin_url):
    """AC-7.2: on a database with no Distill table, the first sync creates it and succeeds."""
    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute("drop database if exists distill_fresh")
        conn.execute("create database distill_fresh")
    fresh = pg_admin_url.replace("/postgres?", "/distill_fresh?")
    with psycopg.connect(fresh) as conn:
        assert conn.execute("select to_regclass('distill_user_state')").fetchone()[0] is None

    env.store = store.PostgresStore(fresh)
    r = client.put("/api/me/state", json={"topics": {"sections": ["science"], "updated_at": iso(NOW)}, "cards": [], "settings": {}})
    assert r.status_code == 200
    assert rows(fresh)["u_test"]["topics"]["sections"] == ["science"]


def test_ac_7_3_without_a_database_everything_stays_on_the_device(monkeypatch):
    """AC-7.3: no DATABASE_URL (previews, tests, local runs) means device-only sync; local runs can opt into a memory store."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DISTILL_MEMORY_STORE", raising=False)
    assert store.configured() is False and store.live_store() is None
    client = TestClient(app_mod.app)
    assert client.get("/api/health").json()["sync_configured"] is False
    r = client.get("/api/me/state")
    assert r.status_code == 409 and r.json()["error"]["code"] in {"sync_not_set_up", "sync_needs_signin"}

    monkeypatch.setenv("DISTILL_MEMORY_STORE", "1")
    assert isinstance(store.live_store(), store.MemoryStore)

    monkeypatch.setenv("DATABASE_URL", "postgresql://distill@db.example.invalid/distill")
    assert store.configured() is True and isinstance(store.live_store(), store.PostgresStore)
    assert TestClient(app_mod.app).get("/api/health").json()["sync_configured"] is True


def test_ac_7_4_unreachable_database_says_will_sync_later(client, env):
    """AC-7.4: when the account database can't be reached, reading and saving both answer "Saved on this device, will sync later"."""
    env.store = store.PostgresStore("postgresql://distill@127.0.0.1:1/distill", connect_timeout=2)
    offline = {"code": "data_offline", "message": "Saved on this device, will sync later."}
    r = client.put("/api/me/state", json={"topics": {}, "cards": dump([card("x", "Kept here", saved=True)]), "settings": {}})
    assert r.status_code == 503 and r.json()["error"] == offline
    r = client.get("/api/me/state")
    assert r.status_code == 503 and r.json()["error"] == offline


async def test_ac_7_5_two_devices_syncing_at_once_keep_both_changes(pg_url):
    """AC-7.5: many syncs for one person at the same moment, each saving a different card: every card is kept."""
    s = store.PostgresStore(pg_url)
    t = NOW

    def adds(n: int):
        incoming = UserState(cards=[card(f"c{n}", f"Story {n}", saved=True, saved_changed_at=iso(t))])
        return lambda stored: merge_states(stored, incoming, t)

    await asyncio.gather(*(s.sync("u_race", adds(n)) for n in range(8)))
    got = await s.load("u_race")
    assert sorted(c.id for c in got.cards) == sorted(f"c{n}" for n in range(8))


def test_ac_7_6_rows_saved_by_v0_1_0_read_unchanged(client, env, pg_url):
    """AC-7.6: a row in the v0.1.0 format (one JSON document per person) loads with its topics and saved card intact."""
    v010 = {
        "version": 1,
        "topics": {"sections": ["finance", "technology"], "keywords": ["gold rate"], "updated_at": "2026-11-25T08:00:00Z"},
        "cards": [
            {
                "id": "a1b2c3",
                "topic_section": "finance",
                "title": "Gold climbs on rate hopes",
                "source_name": "Mock Times",
                "source_url": "https://news.example.com/gold",
                "published_at": "2026-11-24T06:00:00Z",
                "fetched_at": "2026-11-24T07:00:00Z",
                "summary": "Gold rose 1.2% as markets priced in a rate cut.",
                "key_points": ["Gold up 1.2%."],
                "key_figures": [{"label": "Gold", "value": 1.2, "unit": "%"}],
                "story_key": "gold-rate-hopes",
                "relevance": 0.9,
                "saved": True,
                "saved_changed_at": "2026-11-24T07:05:00Z",
                "ai_status": "ok",
            }
        ],
        "settings": {"last_refreshed_at": "2026-11-25T08:00:00Z", "theme": "dark"},
        "updated_at": "2026-11-25T08:00:00Z",
    }
    s = store.PostgresStore(pg_url)
    asyncio.run(s.sync("u_seed", lambda stored: stored))  # makes sure the table exists
    with psycopg.connect(pg_url) as conn:
        conn.execute(
            "insert into distill_user_state (user_id, state) values (%s, %s::jsonb) "
            "on conflict (user_id) do update set state = excluded.state",
            ("u_v010", json.dumps(v010)),
        )

    loaded = asyncio.run(s.load("u_v010"))
    assert loaded.model_dump(mode="json") == UserState.model_validate(v010).model_dump(mode="json")
    env.store, env.user_id = s, "u_v010"
    st = client.get("/api/me/state").json()["state"]
    assert st["topics"]["keywords"] == ["gold rate"] and st["settings"]["theme"] == "dark"
    assert [c["id"] for c in st["cards"]] == ["a1b2c3"]  # saved, so it outlives 24 hours


async def test_table_is_checked_once_per_instance(pg_url):
    """The create-table check runs on the first connection only, so later syncs stay one round of queries."""
    s = store.PostgresStore(pg_url)
    assert s.table_ready is False
    await s.load("nobody")
    assert s.table_ready is True
    assert await s.load("nobody") is None


async def test_memory_store_sync_combines_and_saves():
    """The memory store used in tests and local runs follows the same sync contract as the database."""
    m = store.MemoryStore()
    out = await m.sync("u", lambda stored: stored.model_copy(update={"cards": [card("c", "Story", saved=True)]}))
    assert [c.id for c in out.cards] == ["c"] and (await m.load("u")).cards[0].id == "c"
    m.offline = True
    with pytest.raises(store.StoreUnavailable):
        await m.sync("u", lambda stored: stored)


def test_driver_that_cannot_load_means_will_sync_later(client, env, monkeypatch):
    """If the Postgres driver can't load on the server, sync answers "will sync later" instead of crashing."""
    import builtins

    real_import = builtins.__import__

    def no_psycopg(name, *args, **kwargs):
        if name == "psycopg":
            raise ImportError("no driver")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_psycopg)
    env.store = store.PostgresStore("postgresql://distill@db.example.invalid/distill")
    r = client.put("/api/me/state", json={"topics": {}, "cards": [], "settings": {}})
    assert r.status_code == 503 and r.json()["error"]["code"] == "data_offline"
