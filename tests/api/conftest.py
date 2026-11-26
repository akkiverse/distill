"""Shared test fixtures: a mock news source, a mock AI curator and a memory store. Nothing real is called."""

from __future__ import annotations

import typing
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from distill import app as app_mod
from distill.models import Article, Card
from distill.store import MemoryStore
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 25, 9, 0, tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def article(
    n: int,
    title: str,
    snippet: str = "",
    section: str = "finance",
    url: str | None = None,
    hours_ago: float = 1,
    source: str = "Mock Times",
) -> Article:
    url = url or f"https://news.example.com/story-{n}"
    from distill.textutil import article_id

    return Article(
        id=article_id(url),
        title=title,
        snippet=snippet,
        url=url,
        source_name=source,
        published_at=iso(NOW - timedelta(hours=hours_ago)),
        section=section,
        via="rss",
    )


def card(
    id: str,
    title: str,
    *,
    hours_ago: float = 1,
    saved: bool = False,
    section: str = "finance",
    story_key: str = "",
    saved_changed_at: str | None = None,
) -> Card:
    return Card(
        id=id,
        topic_section=section,
        title=title,
        source_name="Mock Times",
        source_url=f"https://news.example.com/{id}",
        fetched_at=iso(NOW - timedelta(hours=hours_ago)),
        summary="A summary.",
        key_points=["One.", "Two."],
        story_key=story_key,
        saved=saved,
        saved_changed_at=saved_changed_at,
    )


@dataclass
class MockSource:
    name: str
    articles: list[Article] = field(default_factory=list)
    fail: bool = False
    delay: float = 0.0

    async def fetch(self, client: httpx.AsyncClient) -> list[Article]:
        import asyncio

        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise httpx.ConnectError("down")
        return list(self.articles)


@dataclass
class MockCurator:
    """Answers like Studio AI would. `verdicts` maps an article id to the raw answer; default is relevant."""

    verdicts: dict = field(default_factory=dict)
    calls: list[str] = field(default_factory=list)
    raise_exc: Exception | None = None

    async def judge(self, a: Article, sections: Sequence[str], keywords: Sequence[str]) -> dict:
        self.calls.append(a.id)
        if self.raise_exc:
            raise self.raise_exc
        return self.verdicts.get(
            a.id,
            {
                "relevance": 0.9,
                "summary": f"Summary of {a.title}.",
                "key_points": ["First point.", "Second point."],
                "key_figures": [],
                "story_key": a.title.lower().replace(" ", "-")[:40],
            },
        )


@pytest.fixture
def env():
    """Swap the app's adapters for mocks; returns a holder the test fills in."""

    class Env:
        sources: typing.ClassVar[list] = []
        curator = MockCurator()
        store = MemoryStore()
        user_id: str | None = "u_test"

    e = Env()
    e.sources = []
    app = app_mod.app
    app.dependency_overrides[app_mod.get_source_factory] = lambda: lambda sections, keywords: e.sources
    app.dependency_overrides[app_mod.get_curator] = lambda: e.curator
    app.dependency_overrides[app_mod.get_store] = lambda: e.store
    app.dependency_overrides[app_mod.get_user_id] = lambda: e.user_id
    original_now = app_mod.now
    app_mod.now = lambda: NOW
    yield e
    app.dependency_overrides.clear()
    app_mod.now = original_now


@pytest.fixture
def client(env):
    return TestClient(app_mod.app)


# ---------- a throwaway local Postgres for the account-database tests (US-7) ----------
def _initdb() -> str | None:
    import glob
    import shutil

    found = shutil.which("initdb") or next(iter(sorted(glob.glob("/usr/lib/postgresql/*/bin/initdb"), reverse=True)), None)
    return found


@pytest.fixture(scope="session")
def pg_admin_url():
    """A Postgres started just for this test run (DISTILL_TEST_DATABASE_URL to use your own). Skipped if Postgres isn't installed,
    unless DISTILL_REQUIRE_PG=1 (set in CI), where a missing Postgres fails the run."""
    import os
    import shutil
    import socket
    import subprocess
    import tempfile
    from pathlib import Path

    if url := os.environ.get("DISTILL_TEST_DATABASE_URL"):
        yield url
        return
    initdb = _initdb()
    if not initdb:
        if os.environ.get("DISTILL_REQUIRE_PG") == "1":
            pytest.fail("Postgres isn't installed, and DISTILL_REQUIRE_PG=1")
        pytest.skip("Postgres isn't installed here")
    bindir = os.path.dirname(initdb)
    root = Path(tempfile.mkdtemp(prefix="distill-pg-"))  # outside pytest's private folder, so the postgres user can reach it
    data, sock = root / "data", root / "sock"
    sock.mkdir()
    as_user: list[str] = []
    if os.geteuid() == 0:  # Postgres refuses to run as root
        as_user = ["runuser", "-u", "postgres", "--"]
        os.chmod(root, 0o777)
        os.chmod(sock, 0o777)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    subprocess.run([*as_user, initdb, "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8"], check=True, capture_output=True)
    opts = f"-k {sock} -p {port} -c listen_addresses=''"
    subprocess.run([*as_user, f"{bindir}/pg_ctl", "-D", str(data), "-o", opts, "-w", "-l", str(root / "log"), "start"], check=True)
    try:
        yield f"postgresql://postgres@/postgres?host={sock}&port={port}"
    finally:
        subprocess.run([*as_user, f"{bindir}/pg_ctl", "-D", str(data), "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def pg_url(pg_admin_url):
    """The test database, emptied before each test."""
    import psycopg

    with psycopg.connect(pg_admin_url, autocommit=True) as conn:
        conn.execute("drop table if exists distill_user_state")
    return pg_admin_url
