"""News sources behind one adapter interface (`NewsSource`), fetched in parallel with an 8-second limit.

Which sources exist is the founder's news source list (catalog.py, CR-0010): publisher RSS feeds, Google News (topic and
keyword feeds) and the GDELT DOC API, plus The Guardian, NewsData.io, Currents and Marketaux when their key is set.
Only headlines and snippets are read; full articles are never fetched.
"""

from __future__ import annotations

import asyncio
import logging
import os
from calendar import timegm
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Protocol

import feedparser
import httpx

from . import catalog, feeds
from .models import Article
from .textutil import article_id, clean_text

log = logging.getLogger("distill.sources")

TIMEOUT_SECONDS = 8.0
MAX_PER_SOURCE = 25
USER_AGENT = "Distill/0.1 (+https://distill-akkiverse.vercel.app; personal news reader)"


class NewsSource(Protocol):
    """One place news comes from. `name` is what the reader sees if it can't be reached."""

    name: str

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]: ...


@dataclass
class FetchResult:
    articles: list[Article]
    failed: list[str]


def _iso(value) -> str | None:
    if not value:
        return None
    try:
        if isinstance(value, str):
            try:
                dt = parsedate_to_datetime(value)
            except (TypeError, ValueError):
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:  # time.struct_time from feedparser
            dt = datetime.fromtimestamp(timegm(value), tz=UTC)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OverflowError):
        return None


def _article(title: str, url: str, source: str, section: str, via: str, snippet: str = "", published=None) -> Article | None:
    title = clean_text(title, 300)
    if not title or not url or not url.startswith(("http://", "https://")):
        return None
    snippet = clean_text(snippet, 600)
    if snippet.lower().startswith(title.lower()[:40]):
        snippet = snippet[len(title) :].strip(" -–|") if len(snippet) > len(title) + 20 else ""
    return Article(
        id=article_id(url),
        title=title,
        snippet=snippet,
        url=url,
        source_name=source or "Unknown source",
        published_at=_iso(published),
        section=section,
        via=via,
    )


def parse_feed(content: bytes, *, source: str, section: str, via: str = "rss") -> list[Article]:
    parsed = feedparser.parse(content)
    out: list[Article] = []
    for e in parsed.entries[:MAX_PER_SOURCE]:
        title = e.get("title", "")
        name = source
        if via == "google-news":
            # Google News titles end with " - Publisher"; the publisher is also in <source>.
            publisher = (e.get("source") or {}).get("title") or ""
            if publisher and title.endswith(" - " + publisher):
                title = title[: -len(publisher) - 3]
            name = publisher or source
        a = _article(
            title, e.get("link", ""), name, section, via, e.get("summary", ""), e.get("published_parsed") or e.get("updated_parsed")
        )
        if a:
            out.append(a)
    return out


@dataclass
class RssFeed:
    name: str
    url: str
    section: str
    via: str = "rss"

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        r = await client.get(self.url)
        r.raise_for_status()
        articles = parse_feed(r.content, source=self.name, section=self.section, via=self.via)
        if (
            not articles
            and b"<rss" not in r.content[:2000]
            and b"<feed" not in r.content[:2000]
            and b"<rdf" not in r.content[:2000].lower()
        ):
            raise ValueError("not a feed")
        return articles


@dataclass
class Gdelt:
    keywords: Sequence[str]
    name: str = "GDELT"

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        terms = " OR ".join(f'"{k}"' if " " in k else k for k in self.keywords)
        query = f"({terms}) sourcelang:english" if len(self.keywords) > 1 else f"{terms} sourcelang:english"
        r = await client.get(
            "https://api.gdeltproject.org/api/v2/doc/doc",
            params={
                "query": query,
                "mode": "artlist",
                "format": "json",
                "maxrecords": MAX_PER_SOURCE,
                "timespan": "24h",
                "sort": "datedesc",
            },
        )
        r.raise_for_status()
        try:
            items = r.json().get("articles", [])
        except ValueError:  # GDELT answers plain text for queries it rejects
            return []
        out = []
        for it in items:
            seen = it.get("seendate", "")
            published = f"{seen[:4]}-{seen[4:6]}-{seen[6:8]}T{seen[9:11]}:{seen[11:13]}:{seen[13:15]}Z" if len(seen) >= 15 else None
            a = _article(it.get("title", ""), it.get("url", ""), it.get("domain", ""), "keyword", "gdelt", "", published)
            if a:
                out.append(a)
        return out


@dataclass
class Guardian:
    key: str
    query: str
    section: str
    name: str = "The Guardian"

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        r = await client.get(
            "https://content.guardianapis.com/search",
            params={"q": self.query, "api-key": self.key, "show-fields": "trailText", "page-size": 20, "order-by": "newest"},
        )
        r.raise_for_status()
        out = []
        for it in r.json().get("response", {}).get("results", []):
            a = _article(
                it.get("webTitle", ""),
                it.get("webUrl", ""),
                "The Guardian",
                self.section,
                "guardian",
                (it.get("fields") or {}).get("trailText", ""),
                it.get("webPublicationDate"),
            )
            if a:
                out.append(a)
        return out


@dataclass
class NewsData:
    key: str
    query: str
    section: str
    name: str = "NewsData.io"

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        r = await client.get(
            "https://newsdata.io/api/1/latest", params={"apikey": self.key, "q": self.query, "language": "en", "country": "in"}
        )
        r.raise_for_status()
        out = []
        for it in r.json().get("results", []) or []:
            a = _article(
                it.get("title", ""),
                it.get("link", ""),
                it.get("source_name") or it.get("source_id", ""),
                self.section,
                "newsdata",
                it.get("description", ""),
                (it.get("pubDate") or "").replace(" ", "T") + "Z" if it.get("pubDate") else None,
            )
            if a:
                out.append(a)
        return out


@dataclass
class Currents:
    key: str
    query: str
    section: str
    name: str = "Currents"

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        r = await client.get(
            "https://api.currentsapi.services/v1/search", params={"keywords": self.query, "language": "en", "apiKey": self.key}
        )
        r.raise_for_status()
        out = []
        for it in r.json().get("news", []) or []:
            a = _article(
                it.get("title", ""),
                it.get("url", ""),
                it.get("author") or "Currents",
                self.section,
                "currents",
                it.get("description", ""),
                (it.get("published") or "").replace(" +0000", "Z").replace(" ", "T") or None,
            )
            if a:
                out.append(a)
        return out


@dataclass
class Marketaux:
    key: str
    query: str
    section: str
    name: str = "Marketaux"

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        r = await client.get(
            "https://api.marketaux.com/v1/news/all", params={"search": self.query, "language": "en", "api_token": self.key, "limit": 3}
        )
        r.raise_for_status()
        out = []
        for it in r.json().get("data", []) or []:
            a = _article(
                it.get("title", ""),
                it.get("url", ""),
                it.get("source", "Marketaux"),
                self.section,
                "marketaux",
                it.get("description") or it.get("snippet", ""),
                it.get("published_at"),
            )
            if a:
                out.append(a)
        return out


def default_sources(
    sections: Sequence[str],
    keywords: Sequence[str],
    env: dict[str, str] | None = None,
    *,
    entries: Sequence[catalog.SourceEntry] | None = None,
    off: Sequence[str] = (),
) -> list[NewsSource]:
    """The sources one refresh asks, given the reader's sections and keywords.

    `entries` is the founder's news source list (the built-in list when it is None); paused sources and the reader's
    own switched-off sources (`off`) are left out (AC-12.4, AC-12.7). With every source on, this is exactly the list
    v0.6.1 asked (AC-12.10).
    """
    env = dict(os.environ) if env is None else env
    entries = catalog.builtin_catalog().sources if entries is None else entries
    skip = set(off)
    active = [e for e in entries if not e.paused and e.id not in skip]
    kinds = {e.kind: e for e in active if e.kind != "rss"}
    rss = [e for e in active if e.kind == "rss" and e.url]
    out: list[NewsSource] = []
    for section in sections:
        name = feeds.SECTION_NAMES.get(section, section)
        for e in rss:
            if section in e.sections:
                out.append(RssFeed(e.name, e.url, section))
        if "google-news" in kinds:
            out.append(RssFeed(f"Google News {name}", feeds.google_news_section_url(section), section, via="google-news"))
    if "google-news" in kinds:
        for kw in keywords:
            out.append(RssFeed(f'Google News "{kw}"', feeds.google_news_search_url(kw), "keyword", via="google-news"))
    if keywords and "gdelt" in kinds:
        out.append(Gdelt(list(keywords)))
    query = " OR ".join(keywords) if keywords else " OR ".join(feeds.SECTION_NAMES.get(s, s) for s in sections)
    first = sections[0] if not keywords else "keyword"
    if "guardian" in kinds and env.get("GUARDIAN_API_KEY"):
        out.append(Guardian(env["GUARDIAN_API_KEY"], query, first))
    if "newsdata" in kinds and env.get("NEWSDATA_API_KEY"):
        out.append(NewsData(env["NEWSDATA_API_KEY"], query, first))
    if "currents" in kinds and env.get("CURRENTS_API_KEY"):
        out.append(Currents(env["CURRENTS_API_KEY"], query, first))
    if "marketaux" in kinds and env.get("MARKETAUX_API_KEY") and ("finance" in sections or "business" in sections or keywords):
        out.append(Marketaux(env["MARKETAUX_API_KEY"], query, first))
    # The same feed can serve two sections (Business and Finance share one list): ask it once.
    seen: set[str] = set()
    unique: list[NewsSource] = []
    for s in out:
        key = getattr(s, "url", None) or s.name
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique


async def fetch_all(
    sources: Sequence[NewsSource], *, limit_seconds: float | None = None, client: httpx.AsyncClient | None = None
) -> FetchResult:
    """Ask every source at once. A source that fails or takes longer than `timeout` is named in `failed`."""
    timeout = limit_seconds or TIMEOUT_SECONDS
    own = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(timeout), follow_redirects=True, headers={"User-Agent": USER_AGENT})

    async def one(src: NewsSource) -> list[Article] | None:
        try:
            return await asyncio.wait_for(src.fetch(client), timeout)
        except (TimeoutError, httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            log.info("source failed: %s (%s)", src.name, type(exc).__name__)
            return None

    try:
        results = await asyncio.gather(*(one(s) for s in sources))
    finally:
        if own:
            await client.aclose()
    articles: list[Article] = []
    failed: list[str] = []
    for src, res in zip(sources, results, strict=True):
        if res is None:
            failed.append(src.name)
        else:
            articles.extend(res)
    return FetchResult(articles, failed)
