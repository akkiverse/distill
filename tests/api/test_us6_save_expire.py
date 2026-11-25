"""US-6: Save, expire and replace (server side; the device copy is tested in src/*.test.tsx)."""

import json
from datetime import timedelta

import httpx
from conftest import NOW, card, iso
from distill.models import UserState
from distill.rules import merge_cards
from distill.store import PostgrestStore


def dump(cards):
    return [c.model_dump() for c in cards]


def test_ac_6_1_unsaved_card_older_than_24_hours_is_removed(client):
    """AC-6.1: an unsaved card fetched more than 24 hours ago is removed when the app loads."""
    old, fresh = card("old", "Old story", hours_ago=24.5), card("fresh", "Fresh story", hours_ago=23)
    r = client.post("/api/feed/merge", json={"cards": dump([old, fresh]), "new_cards": []})
    assert [c["id"] for c in r.json()["cards"]] == ["fresh"]


def test_ac_6_2_saved_card_older_than_24_hours_stays(client):
    """AC-6.2: a saved card fetched more than 24 hours ago stays."""
    saved = card("kept", "Saved story", hours_ago=72, saved=True)
    r = client.post("/api/feed/merge", json={"cards": dump([saved]), "new_cards": []})
    [c] = r.json()["cards"]
    assert c["id"] == "kept" and c["saved"] is True


def test_ac_6_3_newer_card_on_same_story_replaces_older(client):
    """AC-6.3: same topic and same story key, or titles overlapping 0.6 or more: the newer card replaces the older one."""
    older = card("o1", "India vs Australia: day one report", hours_ago=10, section="sports", story_key="ind-aus-perth-test")
    newer = card("n1", "Perth Test: India take control on day two", hours_ago=0.5, section="sports", story_key="ind-aus-perth-test")
    older2 = card("o2", "Gold rate today rises in Delhi markets", hours_ago=8, story_key="a")
    newer2 = card("n2", "Gold rate today rises in Delhi and Mumbai markets", hours_ago=1, story_key="b")
    other_topic = card("o3", "Gold rate today rises in Delhi markets", hours_ago=8, section="kw:gold rate", story_key="a")
    r = client.post("/api/feed/merge", json={"cards": dump([older, older2, other_topic]), "new_cards": dump([newer, newer2])})
    ids = [c["id"] for c in r.json()["cards"]]
    assert "o1" not in ids and "n1" in ids
    assert "o2" not in ids and "n2" in ids
    assert "o3" in ids  # a different topic is not replaced


def test_ac_6_3_saved_card_is_never_replaced():
    """AC-6.3 applies to unsaved cards only."""
    saved = card("s", "Gold rate today rises", hours_ago=5, saved=True, story_key="gold")
    newer = card("n", "Gold rate today rises again", hours_ago=1, story_key="gold")
    assert {c.id for c in merge_cards([saved], [newer], NOW)} == {"s", "n"}


def test_ac_6_4_unsaved_card_follows_normal_expiry():
    """AC-6.4: once unsaved, a card expires 24 hours after its fetch time, not after the unsave."""
    c = card("c", "Story", hours_ago=30, saved=False, saved_changed_at=iso(NOW))
    assert merge_cards([c], [], NOW) == []
    young = card("y", "Story two", hours_ago=2, saved=False, saved_changed_at=iso(NOW))
    assert [x.id for x in merge_cards([young], [], NOW)] == ["y"]


def test_ac_6_5_saved_on_one_device_appears_on_another(client, env):
    """AC-6.5: device A saves a card; device B (same account) reads Saved and finds it."""
    c = card("c1", "Budget highlights", hours_ago=30, saved=True, saved_changed_at=iso(NOW))
    a_state = {"topics": {"sections": ["finance"], "keywords": [], "updated_at": iso(NOW)}, "cards": dump([c]), "settings": {}}
    assert client.put("/api/me/state", json=a_state).status_code == 200
    # device B had the same card unsaved from an earlier sync, with an older choice
    b_card = card("c1", "Budget highlights", hours_ago=30, saved=False, saved_changed_at=iso(NOW - timedelta(hours=2)))
    b = client.put("/api/me/state", json={"topics": {}, "cards": dump([b_card]), "settings": {}}).json()["state"]
    [got] = [x for x in b["cards"] if x["id"] == "c1"]
    assert got["saved"] is True
    assert b["topics"]["sections"] == ["finance"]  # the newer topics win
    assert client.get("/api/me/state").json()["state"]["cards"][0]["saved"] is True


def test_ac_6_6_data_server_offline_answers_will_sync_later(client, env):
    """AC-6.6: with the data server down the API says so plainly; the device keeps the change (tested in the UI)."""
    env.store.offline = True
    r = client.put("/api/me/state", json={"topics": {}, "cards": [], "settings": {}})
    assert r.status_code == 503
    assert r.json()["error"] == {"code": "data_offline", "message": "Saved on this device, will sync later."}
    env.store.offline = False
    assert (
        client.put("/api/me/state", json={"topics": {}, "cards": dump([card("x", "Later", saved=True)]), "settings": {}}).status_code == 200
    )


def test_sync_needs_sign_in_and_set_up(client, env):
    """Without a signed-in person, or without the data server, sync says so and the app stays device-only."""
    env.user_id = None
    r = client.get("/api/me/state")
    assert r.status_code == 409 and r.json()["error"]["code"] == "sync_needs_signin"
    env.user_id, env.store = "u", None
    assert client.get("/api/me/state").json()["error"]["code"] == "sync_not_set_up"


def test_postgrest_store_reads_and_upserts():
    """The live store talks to PostgREST with the gateway key and upserts one row per person."""
    seen = []
    saved_state = UserState(cards=[card("c", "Story", saved=True)]).model_dump(mode="json")

    def handler(req: httpx.Request):
        seen.append(req)
        assert req.headers["authorization"] == "Bearer secret-key"
        if req.method == "GET":
            return httpx.Response(200, json=[{"state": saved_state}])
        assert "merge-duplicates" in req.headers["prefer"]
        body = json.loads(req.content)
        assert body[0]["user_id"] == "u_1" and body[0]["state"]["cards"][0]["id"] == "c"
        return httpx.Response(201)

    import asyncio

    s = PostgrestStore("https://data.test", "secret-key", transport=httpx.MockTransport(handler))
    got = asyncio.run(s.load("u_1"))
    assert got.cards[0].id == "c"
    asyncio.run(s.save("u_1", got))
    assert seen[0].url.params["user_id"] == "eq.u_1"


def test_postgrest_store_offline_raises_store_unavailable():
    """A data server that doesn't answer becomes StoreUnavailable (shown as "will sync later")."""
    import asyncio

    import pytest
    from distill.store import StoreUnavailable

    def down(req):
        raise httpx.ConnectError("off")

    s = PostgrestStore("https://data.test", "k", transport=httpx.MockTransport(down))
    with pytest.raises(StoreUnavailable):
        asyncio.run(s.load("u"))
