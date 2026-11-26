"""US-8: Published times and a feed that stays fresh (CR-0004). The time display and timers are tested in the UI."""

from conftest import NOW, MockSource, article, card, iso
from distill.models import Card, UserState
from distill.rules import merge_cards, merge_states


def dump(cards):
    return [c.model_dump() for c in cards]


def test_ac_8_5_known_links_are_not_sent_to_the_ai_again(client, env):
    """AC-8.5: stories whose links the app already knows are skipped; only new ones reach the AI."""
    seen = article(1, "Gold rate today climbs in Delhi", url="https://news.example.com/gold-1")
    dropped = article(2, "Bank holiday list for December", url="https://news.example.com/banks-2")
    new = article(3, "Sensex ends higher on IT gains", url="https://news.example.com/sensex-3")
    env.sources = [MockSource("Mock", [seen, dropped, new])]
    known = ["https://news.example.com/gold-1", "https://www.news.example.com/banks-2/?utm_source=x"]
    r = client.post("/api/feed/refresh", json={"sections": ["finance"], "keywords": [], "known_urls": known, "curate": True})
    assert r.status_code == 200
    assert [a["id"] for a in r.json()["articles"]] == [new.id]
    assert env.curator.calls == [new.id]


def test_ac_8_6_newer_report_replaces_older_card_and_says_updated(client):
    """AC-8.6: a newer report on the same story replaces the older card and carries the time it did."""
    older = card("g1", "Gold rate today: 24K at 76,200 in Delhi", hours_ago=3, story_key="gold-rate-delhi")
    newer = card("g2", "Gold rate today: 24K at 76,900 in Delhi", hours_ago=0.2, story_key="gold-rate-delhi")
    r = client.post("/api/feed/merge", json={"cards": dump([older]), "new_cards": dump([newer])})
    [got] = r.json()["cards"]
    assert got["id"] == "g2"
    assert got["replaced_at"] == newer.fetched_at
    # merging again (another refresh, or a sync) keeps the label and doesn't move it
    again = merge_cards([Card(**got)], [], NOW)
    assert [c.replaced_at for c in again] == [newer.fetched_at]


def test_ac_8_6_new_cards_arriving_together_are_not_marked_updated():
    """AC-8.6: only a card the reader already had counts as replaced; two reports in one refresh give a plain card."""
    a = card("a", "Rupee ends flat against the dollar", hours_ago=0.5, story_key="rupee")
    b = card("b", "Rupee ends flat against the dollar today", hours_ago=0.4, story_key="rupee")
    [got] = merge_cards([], [a, b], NOW)
    assert got.id == "b" and got.replaced_at is None


def test_ac_8_6_saved_card_is_not_replaced_and_nothing_is_marked():
    """AC-8.6 follows the existing rule: a saved card is never replaced."""
    saved = card("s", "Gold rate today rises", hours_ago=5, saved=True, story_key="gold")
    newer = card("n", "Gold rate today rises again", hours_ago=1, story_key="gold")
    got = {c.id: c for c in merge_cards([saved], [newer], NOW)}
    assert set(got) == {"s", "n"} and got["n"].replaced_at is None


def test_ac_8_6_label_survives_a_sync_from_a_device_without_it():
    """AC-8.6: a device still holding the card without the label (an older copy) doesn't erase it when syncing."""
    labelled = card("g2", "Gold rate today", hours_ago=0.2).model_copy(update={"replaced_at": iso(NOW)})
    plain = card("g2", "Gold rate today", hours_ago=0.2)
    stored = UserState(cards=[labelled])
    merged = merge_states(stored, UserState(cards=[plain]), NOW)
    assert merged.cards[0].replaced_at == iso(NOW)


def test_ac_8_6_cards_saved_by_v0_2_1_still_read(client):
    """Compatibility: a card stored by v0.2.1 (no replaced_at field) reads and merges unchanged."""
    v021 = {
        "id": "old1",
        "topic_section": "finance",
        "title": "Budget highlights",
        "source_name": "Mint",
        "source_url": "https://news.example.com/old1",
        "published_at": None,
        "fetched_at": iso(NOW),
        "summary": "Key changes in the budget.",
        "key_points": ["One.", "Two."],
        "key_figures": [],
        "story_key": "budget",
        "relevance": 0.9,
        "saved": True,
        "saved_changed_at": iso(NOW),
        "ai_status": "ok",
    }
    r = client.post("/api/feed/merge", json={"cards": [v021], "new_cards": []})
    [got] = r.json()["cards"]
    assert got["replaced_at"] is None
    assert {k: got[k] for k in v021} == v021
