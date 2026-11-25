"""US-2: Fetch matching news."""

import asyncio

import httpx
from conftest import MockSource, article
from distill import feeds, sources
from distill.sources import RssFeed, default_sources, fetch_all, parse_feed


def test_ac_2_1_only_keyword_matches_go_to_ai(client, env):
    """AC-2.1: 10 articles, 4 mention "gold rate" in any case in title or snippet; only those 4 are sent on."""
    matching = [
        article(1, "Gold rate today: prices climb"),
        article(2, "Markets steady", snippet="The GOLD RATE in Delhi rose to 76,200"),
        article(3, "Why the Gold Rate keeps rising"),
        article(4, "Festive buying lifts demand", snippet="gold rate up 1%"),
    ]
    others = [article(10 + i, f"Unrelated finance story number {i} about banks {i}") for i in range(6)]
    env.sources = [MockSource("Mock", matching + others)]
    r = client.post("/api/feed/refresh", json={"sections": ["finance"], "keywords": ["gold rate"]})
    assert r.status_code == 200
    ids = {a["id"] for a in r.json()["articles"]}
    assert ids == {a.id for a in matching}
    # and with curate=true exactly those 4 reach the AI
    env.curator.calls.clear()
    r = client.post("/api/feed/refresh", json={"sections": ["finance"], "keywords": ["gold rate"], "curate": True})
    assert set(env.curator.calls) == {a.id for a in matching}


def test_ac_2_2_same_story_from_two_sources_appears_once(client, env):
    """AC-2.2: same URL, or titles with word overlap of 0.8 or more, appear once."""
    a1 = article(1, "RBI keeps repo rate unchanged at 6.5 percent", url="https://www.site.com/rbi?utm_source=x")
    a2 = article(2, "RBI keeps repo rate unchanged at 6.5 percent", url="https://site.com/rbi/", source="Other")
    b1 = article(3, "India beat Australia by six wickets in Perth Test", url="https://a.com/1")
    b2 = article(4, "India beat Australia by six wickets in Perth Test match", url="https://b.com/2")
    c = article(5, "Sensex falls 500 points as IT stocks slide", url="https://c.com/3")
    env.sources = [MockSource("One", [a1, b1, c]), MockSource("Two", [a2, b2])]
    r = client.post("/api/feed/refresh", json={"sections": ["finance"], "keywords": []})
    titles = [a["title"] for a in r.json()["articles"]]
    assert len(titles) == 3
    assert sum("RBI" in t for t in titles) == 1
    assert sum("Perth" in t for t in titles) == 1


def test_ac_2_3_failed_or_slow_source_is_named_and_others_still_return(client, env, monkeypatch):
    """AC-2.3: one source fails and one is slower than the limit; the others still return and both are named."""
    monkeypatch.setattr(sources, "TIMEOUT_SECONDS", 0.2)
    good = MockSource("Good Feed", [article(1, "Budget session begins on Monday")])
    env.sources = [good, MockSource("Broken Feed", fail=True), MockSource("Slow Feed", [article(2, "late")], delay=1.0)]
    r = client.post("/api/feed/refresh", json={"sections": ["india"], "keywords": []})
    body = r.json()
    assert [a["title"] for a in body["articles"]] == ["Budget session begins on Monday"]
    assert set(body["failed_sources"]) == {"Broken Feed", "Slow Feed"}


def test_ac_2_3_timeout_is_eight_seconds():
    """AC-2.3: each source gets 8 seconds."""
    assert sources.TIMEOUT_SECONDS == 8.0


def test_ac_2_4_at_most_fifteen_articles_go_to_ai(client, env):
    """AC-2.4: 40 distinct stories come back; at most 15 are sent to AI per refresh."""
    words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"]
    many = [
        article(i, f"{words[i % 10]} {words[(i // 10) % 10]} story {i} zulu{i}", section=["finance", "sports"][i % 2], hours_ago=i / 10)
        for i in range(40)
    ]
    env.sources = [MockSource("Many", many)]
    r = client.post("/api/feed/refresh", json={"sections": ["finance", "sports"], "keywords": [], "curate": True})
    body = r.json()
    assert len(body["articles"]) == 15
    assert len(env.curator.calls) == 15
    assert {a["section"] for a in body["articles"]} == {"finance", "sports"}  # sections take turns


def test_known_urls_are_not_fetched_again(client, env):
    """Stories already in the feed are not curated twice."""
    a = article(1, "Gold climbs")
    env.sources = [MockSource("Mock", [a, article(2, "Silver slips")])]
    r = client.post("/api/feed/refresh", json={"sections": ["finance"], "keywords": [], "known_urls": [a.url]})
    assert [x["title"] for x in r.json()["articles"]] == ["Silver slips"]


RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>Gold rate hits record - Mint</title><link>https://www.livemint.com/x</link>
<description>&lt;p&gt;Gold rose to &lt;b&gt;76,200&lt;/b&gt; per 10 g.&lt;/p&gt;</description>
<pubDate>Wed, 25 Nov 2026 07:00:00 GMT</pubDate><source url="https://livemint.com">Mint</source></item>
</channel></rss>"""


def test_rss_parsing_keeps_headline_and_snippet_only():
    """Feeds are read for headline, snippet, link and time; Google News publisher suffixes are removed."""
    [a] = parse_feed(RSS, source="Mint markets", section="finance")
    assert a.title == "Gold rate hits record - Mint" and a.snippet == "Gold rose to 76,200 per 10 g."
    assert a.published_at == "2026-11-25T07:00:00Z"
    [g] = parse_feed(RSS, source="Google News", section="finance", via="google-news")
    assert g.title == "Gold rate hits record" and g.source_name == "Mint"


def test_rss_feed_adapter_reads_over_http():
    """The RSS adapter fetches a feed with httpx (mocked here)."""
    transport = httpx.MockTransport(lambda req: httpx.Response(200, content=RSS))

    async def run():
        async with httpx.AsyncClient(transport=transport) as c:
            return await fetch_all([RssFeed("Mint markets", "https://www.livemint.com/rss/markets", "finance")], client=c)

    res = asyncio.run(run())
    assert len(res.articles) == 1 and res.failed == []


def test_default_sources_cover_sections_keywords_and_keyed_apis():
    """Each section asks its own feeds plus Google News; keywords add Google News search and GDELT; keyed APIs need their key."""
    plain = default_sources(["finance", "sports"], ["gold rate"], env={})
    names = [s.name for s in plain]
    assert "Mint markets" in names and "The Hindu cricket" in names
    assert "Google News Finance" in names and 'Google News "gold rate"' in names and "GDELT" in names
    assert not any(n in names for n in ["The Guardian", "NewsData.io", "Currents", "Marketaux"])
    keyed = [
        s.name
        for s in default_sources(
            ["finance"], [], env={"GUARDIAN_API_KEY": "k", "NEWSDATA_API_KEY": "k", "CURRENTS_API_KEY": "k", "MARKETAUX_API_KEY": "k"}
        )
    ]
    assert {"The Guardian", "NewsData.io", "Currents", "Marketaux"} <= set(keyed)
    # Business and Finance share a list: each feed is asked once
    both = [getattr(s, "url", s.name) for s in default_sources(["business", "finance"], [], env={})]
    assert len(both) == len(set(both))
    assert all(feeds.google_news_section_url(s.id).startswith("https://news.google.com/rss/") for s in feeds.SECTIONS)
