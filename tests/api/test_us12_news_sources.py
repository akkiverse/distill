"""US-12: News sources the founder manages, chosen per person (added CR-0010).

Feed checks are mocked: an address answers with a real RSS feed, an HTML page, an empty feed, an error or a timeout.
The database test runs against a throwaway local Postgres (see `pg_url` in conftest.py).
"""

import asyncio
from datetime import timedelta

import httpx
import pytest
from conftest import NOW, iso
from distill import app as app_mod
from distill import catalog, feeds, sources
from distill.catalog import FeedCheck, MemoryCatalog
from distill.models import Settings, UserState
from distill.rules import merge_states

RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>
<item><title>Monsoon reaches Kerala early this year</title><link>https://example.org/a</link></item>
<item><title>Rupee closes stronger against the dollar</title><link>https://example.org/b</link></item>
</channel></rss>"""
EMPTY = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>"""
HTML = b"<!doctype html><html><head><title>Example news</title></head><body>Home page</body></html>"
NEW_URL = "https://example.org/feed.xml"


def mock_client(routes: dict[str, object]) -> httpx.AsyncClient:
    def handle(request: httpx.Request) -> httpx.Response:
        got = routes.get(str(request.url))
        if got is None:
            return httpx.Response(404)
        if isinstance(got, Exception):
            raise got
        if isinstance(got, int):
            return httpx.Response(got)
        return httpx.Response(200, content=got)  # type: ignore[arg-type]

    return httpx.AsyncClient(transport=httpx.MockTransport(handle))


def checker_for(routes: dict[str, object]):
    calls: list[str] = []

    async def check(url: str) -> FeedCheck:
        calls.append(url)
        async with mock_client(routes) as client:
            return await catalog.check_feed(url, client=client)

    check.calls = calls  # type: ignore[attr-defined]
    return check


@pytest.fixture
def admin(env):
    env.role = "admin"
    env.checker = checker_for({NEW_URL: RSS})
    env.probed = []

    async def probe(entry):
        env.probed.append(entry.id)
        return FeedCheck(True, stories=5)

    o = app_mod.app.dependency_overrides
    o[app_mod.get_user_role] = lambda: env.role
    o[app_mod.get_feed_checker] = lambda: env.checker
    o[app_mod.get_service_probe] = lambda: probe
    return env


def by_name(body: dict, name: str) -> dict:
    return next(s for s in body["sources"] if s["name"] == name)


# ---------------------------------------------------------------- AC-12.1
def test_ac_12_1_admin_only_and_starts_with_todays_sources(client, admin, monkeypatch):
    """AC-12.1: Given the News sources screen, then only Distill's admin role can use it, and it starts with every publisher
    feed with its sections, plus Google News and GDELT; keyed services are listed as needing a key when it isn't set."""
    monkeypatch.delenv("GUARDIAN_API_KEY", raising=False)
    monkeypatch.setenv("NEWSDATA_API_KEY", "nd-test")
    admin.role = None
    assert client.get("/api/admin/sources").status_code == 401
    admin.role = "user"
    r = client.get("/api/admin/sources")
    assert r.status_code == 403 and r.json()["error"]["code"] == "admin_only"
    assert client.post("/api/admin/sources", json={"name": "X", "url": NEW_URL, "sections": ["india"]}).status_code == 403

    admin.role = "admin"
    body = client.get("/api/admin/sources").json()
    urls = {s["url"] for s in body["sources"]}
    for lst in feeds.RSS_FEEDS.values():
        for _name, url in lst:
            assert url in urls
    assert by_name(body, "Mint markets")["sections"] == ["business", "finance"]
    assert by_name(body, "The Hindu")["sections"] == ["india"]
    gn, gd = by_name(body, "Google News"), by_name(body, "GDELT")
    assert gn["can_remove"] is False and gd["can_remove"] is False and not gn["paused"]
    guardian, newsdata = by_name(body, "The Guardian"), by_name(body, "NewsData.io")
    assert guardian["missing_key"] is True and guardian["key_name"] == "GUARDIAN_API_KEY"
    assert newsdata["missing_key"] is False
    # the two feeds the first build found dead are listed, paused, with the reason
    yahoo = by_name(body, "Yahoo Finance")
    assert yahoo["paused"] and "HTTP error" in yahoo["note"]


# ---------------------------------------------------------------- AC-12.2
def test_ac_12_2_check_all_records_ok_counts_and_failing_since(client, admin):
    """AC-12.2: Given "Check all now", then each source that is on is asked once and keeps its last check: OK with how many
    stories, or failing since when and why; a source that keeps failing keeps its first failure time."""
    hindu = "https://www.thehindu.com/feeder/default.rss"
    admin.checker = checker_for({hindu: RSS, feeds.google_news_section_url("world"): RSS})
    body = client.post("/api/admin/sources/check").json()
    assert body["checked_at"] == iso(NOW)
    h = by_name(body, "The Hindu")["check"]
    assert h["ok"] and h["stories"] == 2 and h["failing_since"] is None
    bbc = by_name(body, "BBC World")["check"]
    assert not bbc["ok"] and bbc["failing_since"] == iso(NOW) and "error (404)" in bbc["error"]
    assert by_name(body, "Google News")["check"]["ok"]
    assert "gdelt" in admin.probed
    assert by_name(body, "Yahoo Finance")["check"] is None  # paused: not asked
    assert by_name(body, "The Guardian")["check"] is None  # no key: not asked

    later = NOW + timedelta(hours=1)
    app_mod.now = lambda: later
    again = client.post("/api/admin/sources/check").json()
    bbc2 = by_name(again, "BBC World")["check"]
    assert bbc2["at"] == iso(later) and bbc2["failing_since"] == iso(NOW)


# ---------------------------------------------------------------- AC-12.3
def test_ac_12_3_a_new_feed_is_checked_and_saved_only_when_it_has_stories(client, admin):
    """AC-12.3: Given a new source, when it is saved, then the address is checked from the server first and saved only if it
    answers, is an RSS or Atom feed and has at least one story."""
    r = client.post("/api/admin/sources", json={"name": "  Example   News ", "url": NEW_URL, "sections": ["india", "world", "nope"]})
    assert r.status_code == 201
    added = by_name(r.json(), "Example News")
    assert added["url"] == NEW_URL and added["sections"] == ["india", "world"] and not added["paused"]
    assert added["check"]["ok"] and added["check"]["stories"] == 2 and added["can_remove"]
    assert admin.checker.calls == [NEW_URL]
    # and it feeds the matching sections on the next refresh
    made = sources.default_sources(["world"], [], env={}, entries=asyncio.run(admin.catalog.load()).sources)
    assert any(getattr(s, "url", "") == NEW_URL for s in made)


@pytest.mark.parametrize(
    ("answer", "code", "words"),
    [
        (httpx.ReadTimeout("slow"), "timeout", "didn't answer within 8 seconds"),
        (httpx.ConnectError("no"), "unreachable", "couldn't be reached"),
        (403, "blocked", "blocked the check"),
        (500, "blocked", "answered with an error (500)"),
        (HTML, "not_a_feed", "web page, not a news feed"),
        (EMPTY, "no_stories", "no stories"),
    ],
)
def test_ac_12_3_a_bad_feed_is_refused_with_a_plain_reason_and_not_stored(client, admin, answer, code, words):
    """AC-12.3: otherwise the save is refused with a plain reason, and nothing is stored."""
    admin.checker = checker_for({NEW_URL: answer})
    before = client.get("/api/admin/sources").json()["sources"]
    r = client.post("/api/admin/sources", json={"name": "Example", "url": NEW_URL, "sections": ["india"]})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == code and words in err["message"]
    assert client.get("/api/admin/sources").json()["sources"] == before


def test_ac_12_3_duplicates_bad_addresses_and_missing_fields_are_refused(client, admin):
    """AC-12.3: an address already in the list, one that isn't a web address or points inside a private network, and a
    source with no name or no section are refused before anything is fetched."""
    r = client.post(
        "/api/admin/sources", json={"name": "Again", "url": "https://www.thehindu.com/feeder/default.rss/", "sections": ["india"]}
    )
    assert r.status_code == 409 and "already in the list (The Hindu)" in r.json()["error"]["message"]
    for url in ("ftp://example.org/feed", "example.org/feed", "http://127.0.0.1/feed", "http://localhost:8000/rss", "http://10.0.0.5/rss"):
        r = client.post("/api/admin/sources", json={"name": "Bad", "url": url, "sections": ["india"]})
        assert r.status_code == 422, url
        assert r.json()["error"]["code"] in ("bad_address", "private_address"), url
    assert client.post("/api/admin/sources", json={"name": " ", "url": NEW_URL, "sections": ["india"]}).json()["error"]["code"] == "no_name"
    assert client.post("/api/admin/sources", json={"name": "X", "url": NEW_URL, "sections": []}).json()["error"]["code"] == "no_sections"
    assert admin.checker.calls == []  # all refused before anything was fetched


# ---------------------------------------------------------------- AC-12.4
def test_ac_12_4_edit_name_sections_and_a_checked_new_address(client, admin):
    """AC-12.4: Given a source, when its name, sections or address change, then they are saved; a changed address is
    checked the same way first, and a failing one leaves the source as it was."""
    sid = by_name(client.get("/api/admin/sources").json(), "Quanta")["id"]
    body = client.patch(f"/api/admin/sources/{sid}", json={"name": "Quanta Magazine", "sections": ["science", "technology"]}).json()
    q = next(s for s in body["sources"] if s["id"] == sid)
    assert q["name"] == "Quanta Magazine" and q["sections"] == ["science", "technology"]
    assert admin.checker.calls == []  # same address: no check

    admin.checker = checker_for({NEW_URL: HTML})
    r = client.patch(f"/api/admin/sources/{sid}", json={"url": NEW_URL})
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_a_feed"
    still = next(s for s in client.get("/api/admin/sources").json()["sources"] if s["id"] == sid)
    assert still["url"] == "https://www.quantamagazine.org/feed/"

    admin.checker = checker_for({NEW_URL: RSS})
    q2 = next(s for s in client.patch(f"/api/admin/sources/{sid}", json={"url": NEW_URL}).json()["sources"] if s["id"] == sid)
    assert q2["url"] == NEW_URL and q2["check"]["ok"]

    gn = client.patch("/api/admin/sources/google-news", json={"sections": ["india"]})
    assert gn.status_code == 422 and gn.json()["error"]["code"] == "fixed_source"
    assert client.patch("/api/admin/sources/nope", json={"name": "X"}).status_code == 404


# ---------------------------------------------------------------- AC-12.5
def test_ac_12_5_pause_resume_and_remove(client, admin):
    """AC-12.5: Given a paused source, then it stays listed but is not fetched, and Resume brings it back; Remove takes it
    out; Google News and GDELT can be paused but not removed."""
    body = client.get("/api/admin/sources").json()
    bbc = by_name(body, "BBC World")["id"]
    client.patch(f"/api/admin/sources/{bbc}", json={"paused": True})
    entries = asyncio.run(admin.catalog.load()).sources
    assert next(e for e in entries if e.id == bbc).paused
    assert "BBC World" not in [s.name for s in sources.default_sources(["world"], [], env={}, entries=entries)]
    client.patch(f"/api/admin/sources/{bbc}", json={"paused": False})
    entries = asyncio.run(admin.catalog.load()).sources
    assert "BBC World" in [s.name for s in sources.default_sources(["world"], [], env={}, entries=entries)]

    r = client.delete(f"/api/admin/sources/{bbc}")
    assert r.status_code == 200 and all(s["id"] != bbc for s in r.json()["sources"])
    for fixed in ("google-news", "gdelt"):
        r = client.delete(f"/api/admin/sources/{fixed}")
        assert r.status_code == 409 and "paused but not removed" in r.json()["error"]["message"]
    client.patch("/api/admin/sources/google-news", json={"paused": True})
    entries = asyncio.run(admin.catalog.load()).sources
    made = sources.default_sources(["world"], ["gold rate"], env={}, entries=entries)
    assert not any(getattr(s, "via", "") == "google-news" for s in made)


# ---------------------------------------------------------------- AC-12.6
def test_ac_12_6_each_persons_switches_are_saved_to_their_account_and_newest_wins(client, env):
    """AC-12.6: Given a person switches sources off, then the choice is saved to their account and reaches their other
    devices; the change made last wins, and a device on v0.6.1 (no source settings) never undoes it."""
    env.user_id = "u_akki"
    a = {"topics": {}, "cards": [], "settings": {"sources_off": ["gdelt"], "sources_changed_at": iso(NOW)}}
    assert client.put("/api/me/state", json=a).status_code == 200
    b = client.put("/api/me/state", json={"topics": {}, "cards": [], "settings": {}}).json()["state"]
    assert b["settings"]["sources_off"] == ["gdelt"]  # device B (or an old version) gets it and can't erase it

    older = Settings(sources_off=[], sources_changed_at="2026-11-01T00:00:00Z")
    newer = Settings(sources_off=["x"], sources_changed_at="2026-11-02T00:00:00Z")
    assert merge_states(UserState(settings=newer), UserState(settings=older)).settings.sources_off == ["x"]
    assert merge_states(UserState(settings=older), UserState(settings=newer)).settings.sources_off == ["x"]
    # another person's account is untouched
    env.user_id = "u_other"
    assert client.get("/api/me/state").json()["state"]["settings"].get("sources_off") is None


def test_ac_12_6_person_list_shows_active_sources_only(client, env, monkeypatch):
    """AC-12.6, AC-12.7: Given Settings → Sources, then it lists the active sources with their sections; paused and removed
    ones, and keyed services with no key, are not listed; a source added later is listed (and on)."""
    monkeypatch.delenv("GUARDIAN_API_KEY", raising=False)
    cat = catalog.builtin_catalog()
    yahoo = next(s for s in cat.sources if s.name == "Yahoo Finance")
    cat.sources = [s for s in cat.sources if s.name != "BBC World"]  # removed by the founder
    cat.sources.append(catalog.SourceEntry(id="rss-new", name="Example News", url=NEW_URL, sections=["india"]))
    env.catalog = MemoryCatalog(cat)
    listed = client.get("/api/sources").json()["sources"]
    names = [s["name"] for s in listed]
    assert "Example News" in names and "The Hindu" in names and "Google News" in names
    assert yahoo.name not in names and "BBC World" not in names and "The Guardian" not in names
    assert next(s for s in listed if s["name"] == "Mint markets")["sections"] == ["business", "finance"]


# ---------------------------------------------------------------- AC-12.7, AC-12.8
def test_ac_12_7_a_refresh_leaves_out_the_persons_switched_off_sources(client, env):
    """AC-12.7: Given a signed-in person switched sources off, when their feed refreshes, then those sources aren't asked;
    every other source is."""
    env.user_id = "u_akki"
    body = {"sections": ["world"], "keywords": [], "sources_off": ["gdelt", "google-news"]}
    assert client.post("/api/feed/refresh", json=body).status_code == 200
    call = env.factory_calls[-1]
    assert call["off"] == ["gdelt", "google-news"]
    made = sources.default_sources(["world"], ["x"], env={}, entries=call["entries"], off=call["off"])
    assert made and not any(getattr(s, "via", "") == "google-news" for s in made)
    assert not any(isinstance(s, sources.Gdelt) for s in made)


def test_ac_12_8_signed_out_visitors_use_every_active_source(client, env):
    """AC-12.8: Given a signed-out visitor (or the demo), then every active source is used, whatever the request says."""
    env.user_id = None
    client.post("/api/feed/refresh", json={"sections": ["world"], "keywords": [], "sources_off": ["google-news"]})
    assert env.factory_calls[-1]["off"] == []


# ---------------------------------------------------------------- AC-12.10
def test_ac_12_10_built_in_list_asks_exactly_what_v0_6_1_asked():
    """AC-12.10: Given nobody changed a setting, then each feed is built from the same sources as v0.6.1."""
    for secs in [[s.id] for s in feeds.SECTIONS] + [["business", "finance"], ["india", "world", "sports"]]:
        new = [(s.name, getattr(s, "url", None), getattr(s, "section", None)) for s in sources.default_sources(secs, ["gold rate"], env={})]
        old = []
        for section in secs:  # v0.6.1's default_sources, written out
            for name, url in feeds.rss_feeds_for(section):
                old.append((name, url, section))
            old.append((f"Google News {feeds.SECTION_NAMES[section]}", feeds.google_news_section_url(section), section))
        old.append(('Google News "gold rate"', feeds.google_news_search_url("gold rate"), "keyword"))
        seen, want = set(), []
        for t in old:
            if t[1] not in seen:
                seen.add(t[1])
                want.append(t)
        assert new[:-1] == want, secs
        assert new[-1][0] == "GDELT"
    keyed = sources.default_sources(["finance"], [], env={"GUARDIAN_API_KEY": "g", "MARKETAUX_API_KEY": "m"})
    assert {"The Guardian", "Marketaux"} <= {s.name for s in keyed}


def test_ac_12_10_an_unreadable_list_falls_back_to_the_built_in_one(client, env):
    """AC-12.10: Given the source list can't be read, then a refresh uses the built-in list instead of an empty feed."""
    env.catalog.offline = True
    assert client.post("/api/feed/refresh", json={"sections": ["india"], "keywords": []}).status_code == 200
    names = {e.name for e in env.factory_calls[-1]["entries"]}
    assert "The Hindu" in names and "Google News" in names
    assert client.get("/api/sources").status_code == 200


def test_ac_12_10_state_saved_by_v0_6_1_loads_unchanged(client, env):
    """AC-12.10: Given an account saved by v0.6.1 (no source settings), then topics, saved cards and watchlist read back as
    they were, with every source on."""
    env.user_id = "u_old"
    old = {
        "version": 1,
        "topics": {"sections": ["finance"], "keywords": ["gold rate"], "updated_at": iso(NOW)},
        "cards": [],
        "settings": {"last_refreshed_at": iso(NOW), "theme": "dark", "theme_changed_at": iso(NOW)},
        "watchlist": {"keys": ["NSE:TCS"], "pinned": ["NSE:TCS"], "strip": "feed", "version": 2},
    }
    asyncio.run(env.store.sync("u_old", lambda _s: UserState.model_validate(old)))
    got = client.get("/api/me/state").json()["state"]
    assert got["topics"]["keywords"] == ["gold rate"] and got["settings"]["theme"] == "dark"
    assert got["watchlist"]["keys"] == ["NSE:TCS"] and got["settings"]["sources_off"] is None


def test_ac_12_10_the_list_is_kept_in_the_account_database(pg_url):
    """AC-12.10: Given the account database, then the list is stored there (starting from the built-in one), changes are
    saved in one locked step, and the person table is untouched."""
    import psycopg

    with psycopg.connect(pg_url, autocommit=True) as conn:
        conn.execute("drop table if exists distill_settings")
    db = catalog.PostgresCatalog(pg_url)
    first = asyncio.run(db.load())
    assert len(first.sources) == len(catalog.builtin_catalog().sources)

    def pause(cat):
        cat.sources[0].paused = True
        return cat

    asyncio.run(db.update(pause))
    again = asyncio.run(catalog.PostgresCatalog(pg_url).load())
    assert again.sources[0].paused and again.sources[0].id == first.sources[0].id
    with psycopg.connect(pg_url) as conn:
        assert conn.execute("select count(*) from distill_settings").fetchone()[0] == 1
