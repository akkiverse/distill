"""The news source list (US-12, added CR-0010): which sources Distill asks, kept where the founder can manage it.

The list starts as the built-in sources (feeds.py, Google News, GDELT and the four keyed services) and is stored as one
JSON document in the account database (`distill_settings`, key `news_sources`). Without a database (previews, tests,
local runs) it lives in memory. Whenever the stored list can't be read, the built-in list is used, so the feed is
never empty because of the list (AC-12.10).

A new or changed feed address is checked from the server before it is saved (AC-12.3): it must answer within 8 seconds,
be an RSS or Atom feed and hold at least one story. Nothing that fails the check is stored.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field

from . import feeds
from .textutil import article_id, normalise_url

log = logging.getLogger("distill.catalog")

Kind = Literal["rss", "google-news", "gdelt", "guardian", "newsdata", "currents", "marketaux"]
KEYED: dict[str, tuple[str, str]] = {  # kind: (name, environment variable holding its key)
    "guardian": ("The Guardian", "GUARDIAN_API_KEY"),
    "newsdata": ("NewsData.io", "NEWSDATA_API_KEY"),
    "currents": ("Currents", "CURRENTS_API_KEY"),
    "marketaux": ("Marketaux", "MARKETAUX_API_KEY"),
}
FIXED = {"google-news", "gdelt"}  # can be paused, never removed (AC-12.5)
KEYWORD = "keyword"  # the "section" of sources that serve the reader's keywords
CATALOG_VERSION = 1
CHECK_SECONDS = 8.0
CACHE_SECONDS = 60.0
MAX_SOURCES = 300
GOOGLE_NEWS_URL = "https://news.google.com/rss"
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"


class SourceCheck(BaseModel):
    """The last time a source was asked: OK with how many stories, or failing since when and why."""

    at: str
    ok: bool
    stories: int = 0
    error: str = ""
    failing_since: str | None = None


class SourceEntry(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=60)
    url: str = Field(default="", max_length=500)
    sections: list[str] = Field(default_factory=list)  # section ids; ["keyword"] for GDELT; [] for keyed services
    kind: Kind = "rss"
    paused: bool = False
    builtin: bool = False
    note: str = ""  # why a built-in source starts paused
    check: SourceCheck | None = None
    added_at: str | None = None
    updated_at: str | None = None

    @property
    def removable(self) -> bool:
        return self.kind not in FIXED

    def key_env(self) -> str | None:
        return KEYED[self.kind][1] if self.kind in KEYED else None

    def needs_key(self, env: dict[str, str] | None = None) -> bool:
        name = self.key_env()
        if not name:
            return False
        env = dict(os.environ) if env is None else env
        return not env.get(name)


class Catalog(BaseModel):
    version: int = CATALOG_VERSION
    sources: list[SourceEntry] = Field(default_factory=list)
    checked_at: str | None = None  # the last "check all"
    updated_at: str | None = None

    def get(self, source_id: str) -> SourceEntry | None:
        return next((s for s in self.sources if s.id == source_id), None)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def rss_id(url: str) -> str:
    return "rss-" + article_id(url)[:12]


def builtin_catalog() -> Catalog:
    """Today's sources, as v0.6.1 asked them (AC-12.1): every publisher feed with its sections, Google News, GDELT and the
    keyed services. The two feeds the build check found dead start paused, with the reason."""
    by_url: dict[str, SourceEntry] = {}
    for section, lst in feeds.RSS_FEEDS.items():
        for name, url in lst:
            entry = by_url.get(url)
            if entry is None:
                dropped = feeds.DROPPED.get(url)
                entry = SourceEntry(
                    id=rss_id(url),
                    name=name,
                    url=url,
                    sections=[],
                    paused=bool(dropped),
                    builtin=True,
                    note=f"Paused at the start: {dropped}" if dropped else "",
                )
                by_url[url] = entry
            if section not in entry.sections:
                entry.sections.append(section)
    out = list(by_url.values())
    out.append(
        SourceEntry(
            id="google-news",
            name="Google News",
            url=GOOGLE_NEWS_URL,
            sections=[s.id for s in feeds.SECTIONS] + [KEYWORD],
            kind="google-news",
            builtin=True,
        )
    )
    out.append(SourceEntry(id="gdelt", name="GDELT", url=GDELT_URL, sections=[KEYWORD], kind="gdelt", builtin=True))
    for kind, (name, _env) in KEYED.items():
        out.append(SourceEntry(id=kind, name=name, url="", sections=[], kind=kind, builtin=True))  # type: ignore[arg-type]
    return Catalog(sources=out)


# ---------------------------------------------------------------- storage
class CatalogUnavailable(Exception):
    """The stored list couldn't be read or written."""


class SourceRejected(Exception):
    """A change the list refuses, with a plain reason the founder sees."""

    def __init__(self, code: str, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


Change = Callable[[Catalog], Catalog]


class CatalogStore:
    async def load(self) -> Catalog: ...

    async def update(self, change: Change) -> Catalog: ...


class MemoryCatalog(CatalogStore):
    def __init__(self, catalog: Catalog | None = None) -> None:
        self.raw: str | None = catalog.model_dump_json() if catalog else None
        self.offline = False
        self.reads = 0

    async def load(self) -> Catalog:
        if self.offline:
            raise CatalogUnavailable("offline")
        self.reads += 1
        return Catalog.model_validate_json(self.raw) if self.raw else builtin_catalog()

    async def update(self, change: Change) -> Catalog:
        current = await self.load()
        new = change(current)
        self.raw = new.model_dump_json()
        return new


CREATE_TABLE = """
create table if not exists distill_settings (
  key        text primary key check (length(key) between 1 and 100),
  value      jsonb not null,
  updated_at timestamptz not null default now()
)
"""
KEY = "news_sources"
SELECT = "select value from distill_settings where key = %s"
LOCK = "select value from distill_settings where key = %s for update"
SEED = "insert into distill_settings (key, value) values (%s, %s) on conflict (key) do nothing"
UPSERT = """
insert into distill_settings (key, value, updated_at) values (%s, %s, now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
"""


class PostgresCatalog(CatalogStore):
    """The list in the account database: one row, changed inside a transaction with the row locked."""

    def __init__(self, url: str, connect_timeout: int = 8) -> None:
        self.url = url
        self.connect_timeout = connect_timeout
        self.table_ready = False

    async def _connect(self):
        try:
            import psycopg
        except ImportError as exc:
            raise CatalogUnavailable("driver") from exc
        try:
            conn = await psycopg.AsyncConnection.connect(self.url, connect_timeout=self.connect_timeout, prepare_threshold=None)
        except psycopg.Error as exc:
            raise CatalogUnavailable(type(exc).__name__) from exc
        if not self.table_ready:
            try:
                await conn.execute("select pg_advisory_xact_lock(hashtext('distill_settings'))")
                await conn.execute(CREATE_TABLE)
                await conn.commit()
            except psycopg.Error as exc:
                await conn.close()
                raise CatalogUnavailable(type(exc).__name__) from exc
            self.table_ready = True
        return conn

    async def load(self) -> Catalog:
        conn = await self._connect()
        import psycopg

        try:
            async with conn:
                row = await (await conn.execute(SELECT, (KEY,))).fetchone()
        except psycopg.Error as exc:
            raise CatalogUnavailable(type(exc).__name__) from exc
        return _parse(row[0]) if row else builtin_catalog()

    async def update(self, change: Change) -> Catalog:
        conn = await self._connect()
        import psycopg
        from psycopg.types.json import Jsonb

        try:
            async with conn, conn.transaction():
                await conn.execute(SEED, (KEY, Jsonb(builtin_catalog().model_dump(mode="json"))))
                row = await (await conn.execute(LOCK, (KEY,))).fetchone()
                new = change(_parse(row[0]) if row else builtin_catalog())
                await conn.execute(UPSERT, (KEY, Jsonb(new.model_dump(mode="json"))))
        except psycopg.Error as exc:
            raise CatalogUnavailable(type(exc).__name__) from exc
        return new


def _parse(value) -> Catalog:
    return Catalog.model_validate_json(value) if isinstance(value, str | bytes) else Catalog.model_validate(value)


_memory = MemoryCatalog()
_live: PostgresCatalog | None = None


def live_catalog() -> CatalogStore:
    """The account database when it is set up, otherwise this server's memory (previews and local runs)."""
    global _live
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        if _live is None or _live.url != url:
            _live = PostgresCatalog(url)
        return _live
    return _memory


# ---------------------------------------------------------------- reading for a refresh
_cache: tuple[float, int, Catalog] | None = None


def forget_cache() -> None:
    global _cache
    _cache = None


async def entries_for_refresh(store: CatalogStore) -> list[SourceEntry]:
    """The list a refresh uses, read at most once a minute per server. If it can't be read: the built-in list (AC-12.10)."""
    global _cache
    now = time.monotonic()
    if _cache and _cache[1] == id(store) and now - _cache[0] < CACHE_SECONDS:
        return _cache[2].sources
    try:
        cat = await store.load()
    except CatalogUnavailable as exc:
        log.info("news source list unreadable (%s): using the built-in list", exc)
        return builtin_catalog().sources
    except Exception:
        log.exception("news source list damaged: using the built-in list")
        return builtin_catalog().sources
    _cache = (now, id(store), cat)
    return cat.sources


# ---------------------------------------------------------------- checking an address
@dataclass
class FeedCheck:
    ok: bool
    stories: int = 0
    code: str = ""
    message: str = ""


Checker = Callable[[str], Awaitable[FeedCheck]]

REASONS = {
    "bad_address": "Enter the feed's full address, starting with https:// (or http://).",
    "private_address": "That address points inside a private network. Use the feed's public address.",
    "timeout": "The address didn't answer within 8 seconds. Try again later, or check the address.",
    "unreachable": "The site couldn't be reached. Check the address for typos.",
    "not_a_feed": "This is a web page, not a news feed. Look for the site's RSS or Atom link and use that address.",
    "no_stories": "The feed answered but has no stories in it.",
    "duplicate": "This feed is already in the list",
}


def blocked_status(status: int) -> str:
    if status in (401, 403, 429):
        return f"The site blocked the check (it answered {status}). Some sites refuse servers; try another feed from it."
    return f"The site answered with an error ({status}). Check the address, or try again later."


def address_problem(url: str) -> str | None:
    """A plain reason the address can't be used before anything is fetched, or None."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return "bad_address"
    if parts.scheme not in ("http", "https") or not parts.hostname or " " in url.strip():
        return "bad_address"
    host = parts.hostname.lower()
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        return "private_address"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
        return "private_address"
    return None


async def check_feed(url: str, *, client: httpx.AsyncClient | None = None) -> FeedCheck:
    """Ask the address once from the server: it must answer within 8 seconds, be RSS or Atom, and hold a story (AC-12.3)."""
    from .sources import USER_AGENT, parse_feed

    problem = address_problem(url)
    if problem:
        return FeedCheck(False, code=problem, message=REASONS[problem])
    own = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(CHECK_SECONDS), follow_redirects=True, headers={"User-Agent": USER_AGENT})
    try:
        r = await asyncio.wait_for(client.get(url.strip()), CHECK_SECONDS)
    except TimeoutError:
        return FeedCheck(False, code="timeout", message=REASONS["timeout"])
    except httpx.TimeoutException:
        return FeedCheck(False, code="timeout", message=REASONS["timeout"])
    except httpx.HTTPError:
        return FeedCheck(False, code="unreachable", message=REASONS["unreachable"])
    finally:
        if own:
            await client.aclose()
    if r.status_code >= 400:
        return FeedCheck(False, code="blocked", message=blocked_status(r.status_code))
    head = r.content[:3000].lower()
    is_feed = b"<rss" in head or b"<feed" in head or b"<rdf" in head
    if not is_feed:
        return FeedCheck(False, code="not_a_feed", message=REASONS["not_a_feed"])
    stories = parse_feed(r.content, source="check", section="check")
    if not stories:
        return FeedCheck(False, code="no_stories", message=REASONS["no_stories"])
    return FeedCheck(True, stories=len(stories))


def same_address(a: str, b: str) -> bool:
    return normalise_url(a.strip()) == normalise_url(b.strip())


def clean_sections(sections: Sequence[str]) -> list[str]:
    secs = [s for s in dict.fromkeys(sections) if s in feeds.SECTION_IDS]
    if not secs:
        raise SourceRejected("no_sections", "Pick at least one section for this source.")
    return secs


def clean_name(name: str) -> str:
    n = " ".join((name or "").split())[:60]
    if not n:
        raise SourceRejected("no_name", "Give the source a name.")
    return n


def recorded(entry: SourceEntry, result: FeedCheck, at: datetime) -> SourceCheck:
    """The check to keep on a source: failing_since stays at the first failure until it answers again (AC-12.2)."""
    t = _iso(at)
    if result.ok:
        return SourceCheck(at=t, ok=True, stories=result.stories)
    since = entry.check.failing_since if entry.check and not entry.check.ok and entry.check.failing_since else t
    return SourceCheck(at=t, ok=False, error=result.message, failing_since=since)
