"""US-3: AI curation."""

import json

import httpx
import pytest
from conftest import MockCurator, MockSource, article
from distill import app as app_mod
from distill import studio_ai
from distill.curator import StudioAICurator


def test_ac_3_1_low_relevance_produces_no_card(client, env):
    """AC-3.1: an article the AI scores below 0.5 produces no card."""
    keep, drop = article(1, "RBI holds rates"), article(2, "Ten celebrity gold outfits")
    env.curator = MockCurator(
        verdicts={drop.id: {"relevance": 0.49, "summary": "x", "key_points": [], "key_figures": [], "story_key": "x"}}
    )
    env.sources = [MockSource("Mock", [keep, drop])]
    body = client.post("/api/feed/refresh", json={"sections": ["finance"], "keywords": [], "curate": True}).json()
    assert [c["id"] for c in body["cards"]] == [keep.id]
    one = client.post("/api/feed/curate", json={"article": drop.model_dump(), "sections": ["finance"]}).json()
    assert one["card"] is None and one["ai_status"] == "ok"


def test_ac_3_2_summary_at_most_400_and_two_to_four_points(client, env):
    """AC-3.2: a long summary is cut to 400 characters; 6 points become 4; 1 point is filled up to 2."""
    long_a, short_a = (
        article(1, "Long story", snippet="First fact here. Second fact here."),
        article(2, "Short story", snippet="Only fact. Another fact."),
    )
    env.curator = MockCurator(
        verdicts={
            long_a.id: {
                "relevance": 0.9,
                "summary": "word " * 200,
                "key_points": [f"Point {i}" for i in range(6)],
                "key_figures": [],
                "story_key": "long",
            },
            short_a.id: {"relevance": 0.9, "summary": "Short.", "key_points": ["Just one"], "key_figures": [], "story_key": "short"},
        }
    )
    for a, n in [(long_a, 4), (short_a, 2)]:
        c = client.post("/api/feed/curate", json={"article": a.model_dump()}).json()["card"]
        assert len(c["summary"]) <= 400
        assert len(c["key_points"]) == n
        assert c["ai_status"] == "ok"


def test_ac_3_3_figures_not_in_the_text_are_dropped(client, env):
    """AC-3.3: a figure is kept only if its number appears in the title or snippet."""
    a = article(1, "Gold rate rises to 76,200 per 10 g", snippet="Up 1.5% from 75,075 yesterday.")
    env.curator = MockCurator(
        verdicts={
            a.id: {
                "relevance": 0.9,
                "summary": "Gold rose.",
                "key_points": ["a", "b"],
                "story_key": "gold",
                "key_figures": [
                    {"label": "Today", "value": 76200, "unit": "INR/10 g"},
                    {"label": "Yesterday", "value": 75075, "unit": "INR/10 g"},
                    {"label": "Change", "value": 1.5, "unit": "%"},
                    {"label": "Invented", "value": 80000, "unit": "INR/10 g"},
                ],
            }
        }
    )
    c = client.post("/api/feed/curate", json={"article": a.model_dump()}).json()["card"]
    assert [f["value"] for f in c["key_figures"]] == [76200, 75075, 1.5]


@pytest.fixture
def ai_server(monkeypatch):
    """Studio AI pointed at a fake address, answered by a mock transport."""
    monkeypatch.setenv("AI_ENDPOINTS", "https://ai.test")
    monkeypatch.setenv("AI_GATEWAY_KEY", "test-key")
    holder = {"handler": None}
    monkeypatch.setattr(studio_ai, "TRANSPORT", httpx.MockTransport(lambda req: holder["handler"](req)))
    monkeypatch.setattr(studio_ai, "_shared", None, raising=False)
    return holder


def test_ac_3_4_ai_offline_gives_headline_cards(client, env, ai_server):
    """AC-3.4: with Studio AI unreachable, headline-only cards come back with ai_status "offline"."""

    def down(req):
        raise httpx.ConnectError("no route")

    ai_server["handler"] = down
    env.curator = StudioAICurator()
    a = article(1, "Monsoon session ends")
    env.sources = [MockSource("Mock", [a])]
    body = client.post("/api/feed/refresh", json={"sections": ["india"], "keywords": [], "curate": True}).json()
    assert body["ai_status"] == "offline"
    [c] = body["cards"]
    assert c["ai_status"] == "offline" and c["title"] == "Monsoon session ends" and c["summary"] == "" and c["key_points"] == []
    one = client.post("/api/feed/curate", json={"article": a.model_dump()})
    assert one.status_code == 200 and one.json()["ai_status"] == "offline"


def test_studio_ai_happy_path_builds_a_card(client, env, ai_server):
    """The live curator sends the story to Studio AI and turns its JSON answer into a card."""
    answer = {
        "relevance": 0.8,
        "summary": "Gold rose to 76,200.",
        "key_points": ["Gold up", "Demand up"],
        "key_figures": [{"label": "Gold", "value": 76200, "unit": "INR"}],
        "story_key": "Gold Price India",
    }
    ai_server["handler"] = lambda req: httpx.Response(
        200, json={"model": "gemma4:e4b", "message": {"role": "assistant", "content": json.dumps(answer)}, "done": True}
    )
    env.curator = StudioAICurator()
    a = article(1, "Gold at 76,200")
    c = client.post("/api/feed/curate", json={"article": a.model_dump(), "sections": ["finance"]}).json()["card"]
    assert c["summary"] == "Gold rose to 76,200." and c["story_key"] == "gold-price-india" and c["key_figures"][0]["value"] == 76200


def test_ai_not_configured_gives_headline_cards(client, env, monkeypatch):
    """Without AI settings the app still works, with headline-only cards marked not_configured."""
    monkeypatch.delenv("AI_ENDPOINTS", raising=False)
    env.curator = app_mod.get_curator()
    assert env.curator is None
    c = client.post("/api/feed/curate", json={"article": article(1, "Story").model_dump()}).json()
    assert c["ai_status"] == "not_configured" and c["card"]["summary"] == ""


def test_bad_ai_answer_is_not_trusted(client, env):
    """An answer that doesn't match the schema becomes a headline card, not an error page."""
    a = article(1, "Story")
    env.curator = MockCurator(verdicts={a.id: {"relevance": "very", "summary": 3}})
    c = client.post("/api/feed/curate", json={"article": a.model_dump()}).json()
    assert c["ai_status"] == "error" and c["card"]["title"] == "Story"
