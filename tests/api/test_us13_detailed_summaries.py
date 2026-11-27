"""US-13 (added CR-0011): detailed story summaries in bullet points, written from the real article."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

import httpx
import pytest
from conftest import NOW, card, iso
from distill import app as app_mod
from distill import studio_ai
from distill.detail import DetailRequest, checked_points, checked_summary, detail
from distill.models import Card, UserState
from distill.reader import MIN_TEXT, HttpArticleReader, Unreadable, main_text
from distill.rules import merge_cards, merge_states
from distill.textutil import numbers_in

PARAS = [
    "The Reserve Bank of India kept its main lending rate at 6.5% on Friday, the ninth meeting in a row without a change.",
    "Governor Sanjay Malhotra said inflation had eased to 4.2% in October but food prices were still a worry for families.",
    "Five of the six members of the monetary policy committee voted to hold the rate, while one member asked for a cut.",
    "The bank raised its growth forecast for the year to 7.2%, citing strong spending in towns and villages after the festivals.",
    "Economists expect the first cut in February if prices keep falling, and markets rose slightly after the announcement.",
]

ARTICLE_HTML = f"""<!doctype html><html><head><title>RBI holds</title><script>var ad = "Subscribe now for 99 rupees a month and more";</script>
<style>p {{ color: red }}</style></head><body>
<header><nav><p>Home · Markets · Economy · Opinion · Sign in to read this and many more stories</p></nav></header>
<main><article><h1>RBI holds rates</h1>{"".join(f"<p>{p}</p>" for p in PARAS)}
<figure><p>Photo caption: the RBI building in Mumbai on a rainy morning in the monsoon</p></figure></article></main>
<aside><p>Related: 10 stocks to buy this week before the market closes on Friday evening</p></aside>
<footer><p>Copyright 2026 Example Media Private Limited. All rights reserved worldwide.</p></footer></body></html>"""

ARTICLE_TEXT = "\n".join(PARAS)

GOOD_ANSWER = {
    "summary": (
        "The Reserve Bank of India kept its lending rate at 6.5% for the ninth meeting in a row. Inflation eased to 4.2% in October. "
        "Five of six members voted to hold. The growth forecast rose to 7.2%. A first cut may come in February."
    ),
    "points": [
        "The RBI kept its main lending rate at 6.5% on Friday.",
        "It is the ninth meeting in a row without a change.",
        "Inflation eased to 4.2% in October.",
        "Food prices are still a worry for families.",
        "Five of the six committee members voted to hold.",
        "One member asked for a cut.",
        "The growth forecast for the year rose to 7.2%.",
        "Economists expect the first cut in February.",
    ],
}


@dataclass
class MockReader:
    text: str = ARTICLE_TEXT
    fail: str | None = None
    calls: list[str] = field(default_factory=list)

    async def read(self, url: str) -> str:
        self.calls.append(url)
        if self.fail:
            raise Unreadable(self.fail)
        return self.text


@dataclass
class MockDetailer:
    answer: dict | None = None
    raise_exc: Exception | None = None
    calls: list[str] = field(default_factory=list)

    async def write(self, title: str, source_name: str, text: str) -> dict:
        self.calls.append(text)
        if self.raise_exc:
            raise self.raise_exc
        return self.answer if self.answer is not None else GOOD_ANSWER


REQ = DetailRequest(url="https://news.example.com/rbi", title="RBI holds rates at 6.5%", source_name="Mock Times")


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def detail_env(env):
    """The app's article reader and detail writer swapped for mocks."""
    env.reader = MockReader()
    env.detailer = MockDetailer()
    app_mod.app.dependency_overrides[app_mod.get_reader] = lambda: env.reader
    app_mod.app.dependency_overrides[app_mod.get_detailer] = lambda: env.detailer
    return env


def html_transport(html: str = ARTICLE_HTML, status: int = 200, kind: str = "text/html; charset=utf-8", seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(str(request.url))
        return httpx.Response(status, text=html, headers={"content-type": kind})

    return httpx.MockTransport(handler)


def reader_with(transport: httpx.MockTransport) -> HttpArticleReader:
    return HttpArticleReader(httpx.AsyncClient(transport=transport, follow_redirects=False))


# ---------- AC-13.1: the article page is read on the server and its main text goes to the AI ----------
def test_ac_13_1_main_text_keeps_article_paragraphs_only():
    """AC-13.1: only the article's paragraphs are kept: no scripts, styles, menus, captions, related links or footer."""
    text = main_text(ARTICLE_HTML)
    for p in PARAS:
        assert p in text
    for junk in ("Subscribe now", "color: red", "Sign in to read", "Photo caption", "10 stocks", "Copyright"):
        assert junk not in text


def test_ac_13_1_main_text_without_article_tag_uses_all_paragraphs():
    """AC-13.1: a page without <article> or <main> still gives its paragraphs."""
    html = "<html><body>" + "".join(f"<div><p>{p}</p></div>" for p in PARAS) + "</body></html>"
    assert main_text(html) == ARTICLE_TEXT


def test_ac_13_1_live_reader_fetches_the_page():
    """AC-13.1: the live reader fetches the publisher's page on the server and answers its main text."""
    seen: list[str] = []
    text = run(reader_with(html_transport(seen=seen)).read("https://news.example.com/rbi"))
    assert seen == ["https://news.example.com/rbi"]
    assert text == ARTICLE_TEXT


def test_ac_13_1_detail_route_reads_article_and_answers_points(client, detail_env):
    """AC-13.1: POST /api/feed/detail reads the article, gives its text to the AI and answers the summary and points."""
    r = client.post("/api/feed/detail", json=REQ.model_dump())
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert detail_env.reader.calls == ["https://news.example.com/rbi"]
    assert detail_env.detailer.calls == [ARTICLE_TEXT]
    assert body["points"] == GOOD_ANSWER["points"]
    assert body["summary"].startswith("The Reserve Bank of India kept its lending rate at 6.5%")


def test_ac_13_1_live_detailer_uses_studio_ai_with_schema(monkeypatch):
    """AC-13.1: the live writer calls Studio AI with the detail prompt and a JSON schema."""
    from distill import detail as detail_mod
    from distill import prompts

    sent = {}

    async def fake_chat(messages, **kw):
        sent["messages"], sent["kw"] = messages, kw
        return type("Reply", (), {"data": GOOD_ANSWER})()

    monkeypatch.setattr(studio_ai, "chat", fake_chat)
    out = run(detail_mod.StudioAIDetailer().write("RBI holds", "Mock Times", ARTICLE_TEXT))
    assert out == GOOD_ANSWER
    assert sent["kw"]["json_schema"] == prompts.DETAIL_SCHEMA
    assert sent["messages"][0]["content"] == prompts.DETAIL_SYSTEM
    assert ARTICLE_TEXT in sent["messages"][1]["content"]
    assert "not instructions" in prompts.DETAIL_SYSTEM


# ---------- AC-13.2: only facts stated in the article ----------
def test_ac_13_2_points_with_numbers_not_in_the_article_are_dropped():
    """AC-13.2: a bullet point with a number the article doesn't state is dropped; the rest stay."""
    allowed = numbers_in(ARTICLE_TEXT)
    points = checked_points(["Inflation eased to 4.2% in October.", "The rate is now 7.5%.", "Food prices are a worry."], allowed)
    assert points == ["Inflation eased to 4.2% in October.", "Food prices are a worry."]


def test_ac_13_2_summary_sentences_with_unknown_numbers_are_dropped():
    """AC-13.2: a summary sentence with a number not in the article is dropped."""
    allowed = numbers_in(ARTICLE_TEXT)
    out = checked_summary("The RBI held the rate at 6.5%. It also cut a different rate by 25 points. Growth looks strong.", allowed)
    assert out == "The RBI held the rate at 6.5%. Growth looks strong."


def test_ac_13_2_detail_route_applies_the_number_rule(client, detail_env):
    """AC-13.2: the route answers only points whose numbers are in the article or headline."""
    detail_env.detailer.answer = {"summary": "Held at 6.5%.", "points": ["Held at 6.5%.", "Up 99% this year.", "Growth forecast is 7.2%."]}
    body = client.post("/api/feed/detail", json=REQ.model_dump()).json()
    assert body["points"] == ["Held at 6.5%.", "Growth forecast is 7.2%."]


# ---------- AC-13.3: only the summary is kept, never the article ----------
def test_ac_13_3_answer_carries_no_article_text(client, detail_env):
    """AC-13.3: the answer holds only the AI's summary and points, never the article's own text."""
    body = client.post("/api/feed/detail", json=REQ.model_dump()).json()
    assert set(body) == {"status", "summary", "points"}
    blob = str(body)
    assert PARAS[1] not in blob and PARAS[3] not in blob


def test_ac_13_3_stored_card_has_no_article_text_and_keeps_the_link():
    """AC-13.3: a card with a detailed summary keeps the publisher's link and stores no article text."""
    c = card("a1", "RBI holds").model_copy(
        update={"detail_status": "ready", "detail_summary": "Held.", "detail_points": ["Held.", "Again."]}
    )
    dumped = c.model_dump()
    assert dumped["source_url"] == "https://news.example.com/a1"
    assert not any(k in dumped for k in ("text", "article_text", "body", "content"))


# ---------- AC-13.4: pages that can't be read ----------
@pytest.mark.parametrize(
    ("transport", "reason"),
    [
        (html_transport(status=403), "status_403"),
        (html_transport(status=402), "status_402"),
        (
            html_transport(html="<html><body><p>Subscribe to keep reading this story, it only takes a minute.</p></body></html>"),
            "too_little_text",
        ),
        (html_transport(kind="application/pdf"), "not_html"),
    ],
)
def test_ac_13_4_unreadable_pages(transport, reason):
    """AC-13.4: a paywall, a block, a non-page or a teaser is 'unreadable', not an error."""
    with pytest.raises(Unreadable) as exc:
        run(reader_with(transport).read("https://news.example.com/rbi"))
    assert exc.value.reason == reason


def test_ac_13_4_slow_site_is_unreadable():
    """AC-13.4: a site that doesn't answer within the limit is unreadable."""

    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(Unreadable) as exc:
        run(reader_with(httpx.MockTransport(handler)).read("https://news.example.com/slow"))
    assert exc.value.reason == "timeout"


def test_ac_13_4_redirect_to_private_address_is_refused():
    """AC-13.4: a redirect into a private network is never followed."""
    seen: list[str] = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})

    with pytest.raises(Unreadable) as exc:
        run(reader_with(httpx.MockTransport(handler)).read("https://news.example.com/r"))
    assert exc.value.reason == "bad_address"
    assert seen == ["https://news.example.com/r"]


def test_ac_13_4_redirects_are_followed_to_the_article():
    """AC-13.4: an ordinary redirect to the article is followed."""

    def handler(request):
        if request.url.path == "/short":
            return httpx.Response(301, headers={"location": "/rbi"})
        return httpx.Response(200, text=ARTICLE_HTML, headers={"content-type": "text/html"})

    assert run(reader_with(httpx.MockTransport(handler)).read("https://news.example.com/short")) == ARTICLE_TEXT


def test_ac_13_4_google_news_links_are_unreadable_without_a_request():
    """AC-13.4: Google News links reach the article only through a script, so they are unreadable at once."""
    seen: list[str] = []
    with pytest.raises(Unreadable):
        run(reader_with(html_transport(seen=seen)).read("https://news.google.com/rss/articles/abc"))
    assert seen == []


def test_ac_13_4_route_answers_unavailable_and_does_not_call_ai(client, detail_env):
    """AC-13.4: an unreadable page answers 'unavailable' and the AI isn't asked."""
    detail_env.reader.fail = "status_403"
    body = client.post("/api/feed/detail", json=REQ.model_dump()).json()
    assert body == {"status": "unavailable", "summary": "", "points": []}
    assert detail_env.detailer.calls == []


@pytest.mark.parametrize(
    "answer", [{"summary": "x", "points": []}, {"summary": "x", "points": ["Only one point."]}, {"points": "not a list"}]
)
def test_ac_13_4_unusable_ai_answer_is_error(answer):
    """AC-13.4: an AI answer with fewer than 2 usable points, or the wrong shape, is an 'error' (the app tries twice at most)."""
    out = run(detail(REQ, MockReader(), MockDetailer(answer=answer)))
    assert out.status == "error"


def test_ac_13_4_short_text_minimum_is_meaningful():
    """AC-13.4: the minimum article length is a few sentences, so a teaser line never counts as an article."""
    assert 300 <= MIN_TEXT <= 1000


# ---------- AC-13.5 and AC-13.6: the longer summary and up to 10 points ----------
def test_ac_13_5_summary_is_at_most_five_sentences():
    """AC-13.5: the longer summary is cut to 5 sentences and 900 characters."""
    allowed = numbers_in(ARTICLE_TEXT)
    raw = " ".join(f"Sentence number {w} is here." for w in ["one", "two", "three", "four", "five", "six", "seven"])
    out = checked_summary(raw, allowed)
    assert out.count(".") == 5 and "six" not in out
    assert len(checked_summary("Word " * 400 + ".", allowed)) <= 900


def test_ac_13_6_at_most_ten_clean_points():
    """AC-13.6: at most 10 points, one line each, without bullet marks or repeats."""
    raw = ["- First  point\nhere.", "• First point here.", *[f"Point {w}." for w in "abcdefghijkl"]]
    points = checked_points(raw, set())
    assert points[0] == "First point here."
    assert len(points) == 10
    assert all(not p.startswith(("-", "•")) and "\n" not in p for p in points)


def test_ac_13_6_card_holds_up_to_ten_points():
    """AC-13.6: a card stores up to 10 detailed points."""
    c = card("a1", "T").model_copy(update={"detail_points": [f"P{i}." for i in range(10)]})
    assert Card.model_validate(c.model_dump()).detail_points[-1] == "P9."
    with pytest.raises(ValueError):
        Card.model_validate({**c.model_dump(), "detail_points": [f"P{i}." for i in range(11)]})


# ---------- AC-13.8: kept once made, on every device ----------
def _detailed(c: Card, status: str = "ready") -> Card:
    return c.model_copy(
        update={"detail_status": status, "detail_summary": "Longer.", "detail_points": ["A.", "B."] if status == "ready" else []}
    )


def test_ac_13_8_merge_keeps_a_detailed_summary_from_either_copy():
    """AC-13.8: when two copies of a card meet, the detailed summary is kept even if the other copy is newer."""
    old = _detailed(card("a1", "Story one", hours_ago=2))
    newer = card("a1", "Story one", hours_ago=1)
    for pair in ([old], [newer]), ([newer], [old]):
        out = merge_cards(*pair, now=NOW)
        assert out[0].detail_status == "ready" and out[0].detail_points == ["A.", "B."]


def test_ac_13_8_ready_beats_unavailable_on_merge():
    """AC-13.8: a ready detailed summary wins over an 'unavailable' mark from another device."""
    a = _detailed(card("a1", "Story one", hours_ago=1), "unavailable")
    b = _detailed(card("a1", "Story one", hours_ago=2), "ready")
    assert merge_cards([a], [b], now=NOW)[0].detail_status == "ready"


def test_ac_13_8_account_sync_keeps_detailed_summaries():
    """AC-13.8: syncing to the account keeps the detailed summary made on one device."""
    stored = UserState(cards=[_detailed(card("a1", "Story one"))])
    incoming = UserState(cards=[card("a1", "Story one", hours_ago=0.5)])
    merged = merge_states(stored, incoming, now=NOW)
    assert merged.cards[0].detail_points == ["A.", "B."]


def test_ac_13_8_state_round_trip_through_the_api(client, detail_env):
    """AC-13.8: PUT then GET /api/me/state keeps the detail fields."""
    state = UserState(cards=[_detailed(card("a1", "Story one"))]).model_dump()
    assert client.put("/api/me/state", json=state).status_code == 200
    got = client.get("/api/me/state").json()["state"]["cards"][0]
    assert got["detail_status"] == "ready" and got["detail_points"] == ["A.", "B."] and got["detail_summary"] == "Longer."


# ---------- AC-13.9: AI offline ----------
def test_ac_13_9_ai_offline_answers_offline(client, detail_env):
    """AC-13.9: with the AI offline the route answers 'offline' (the app asks again later) and nothing breaks."""
    detail_env.detailer.raise_exc = studio_ai.AIUnavailable()
    r = client.post("/api/feed/detail", json=REQ.model_dump())
    assert r.status_code == 200 and r.json()["status"] == "offline"


def test_ac_13_9_ai_not_set_up_reads_no_page(client, detail_env):
    """AC-13.9: without AI set up, no article page is read at all and the answer is 'not_configured'."""
    app_mod.app.dependency_overrides[app_mod.get_detailer] = lambda: None
    body = client.post("/api/feed/detail", json=REQ.model_dump()).json()
    assert body["status"] == "not_configured"
    assert detail_env.reader.calls == []


def test_ac_13_9_ai_error_answers_error(client, detail_env):
    """AC-13.9: an AI error is answered as 'error', never as a failed request."""
    detail_env.detailer.raise_exc = studio_ai.AIError("bad", code="ai_bad_answer")
    assert client.post("/api/feed/detail", json=REQ.model_dump()).json()["status"] == "error"


# ---------- AC-13.10: what v0.7.0 saved still works ----------
V070_CARD = {
    "id": "a1",
    "topic_section": "finance",
    "title": "Gold hits a new high",
    "source_name": "Mock Times",
    "source_url": "https://news.example.com/gold",
    "published_at": iso(NOW),
    "fetched_at": iso(NOW),
    "summary": "Gold rose.",
    "key_points": ["Gold rose.", "Again."],
    "key_figures": [],
    "story_key": "gold-high",
    "relevance": 0.9,
    "saved": True,
    "saved_changed_at": iso(NOW),
    "ai_status": "ok",
    "replaced_at": None,
    "cover": "Gold hits a new high",
    "visual": None,
}


def test_ac_13_10_v070_cards_load_without_detail():
    """AC-13.10: a card saved by v0.7.0 loads unchanged, with no detailed summary yet."""
    c = Card.model_validate(V070_CARD)
    assert c.detail_status is None and c.detail_points == [] and c.detail_summary == "" and c.detail_tries == 0
    assert c.saved and c.summary == "Gold rose."


def test_ac_13_10_v070_state_syncs_and_keeps_saved_cards(client, detail_env):
    """AC-13.10: a whole v0.7.0 state syncs as before: saved cards and summaries stay."""
    state = {
        "version": 1,
        "topics": {"sections": ["finance"], "keywords": [], "updated_at": iso(NOW)},
        "cards": [V070_CARD],
        "settings": {},
        "updated_at": iso(NOW),
    }
    r = client.put("/api/me/state", json=state)
    assert r.status_code == 200
    got = r.json()["state"]["cards"][0]
    assert got["saved"] is True and got["summary"] == "Gold rose." and got["detail_status"] is None
