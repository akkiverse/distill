"""Distill API (FastAPI). Every route is under /api; the React interface calls it."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import curator as curator_mod
from . import feeds, sources, store, studio_ai, studio_auth
from .curator import Curator, curate
from .models import (
    CurateRequest,
    CurateResponse,
    MergeRequest,
    MergeResponse,
    RefreshRequest,
    RefreshResponse,
    Section,
    StateResponse,
    UserState,
)
from .rules import iso, merge_cards, merge_states
from .selection import select_for_ai

VERSION = "0.1.0"
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Distill API", version=VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
studio_ai.install(app)

SourceFactory = Callable[[Sequence[str], Sequence[str]], list[sources.NewsSource]]


# ---------- dependencies (replaced in tests) ----------
def get_source_factory() -> SourceFactory:
    return sources.default_sources


def get_curator() -> Curator | None:
    return curator_mod.live_curator()


def get_store() -> store.Store | None:
    return store.live_store()


def get_user_id(request: Request) -> str | None:
    """Whose data this is: the Studio Accounts person signed in to Distill, or None."""
    claims = studio_auth.optional_user(request)
    return str(claims["sub"]) if claims and claims.get("sub") else None


def now() -> datetime:
    return datetime.now(UTC)


# ---------- errors ----------
def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers={"Cache-Control": "no-store"})


@app.exception_handler(HTTPException)
async def _http_error(_request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return _error(exc.status_code, exc.detail["code"], exc.detail.get("message", ""))
    return _error(exc.status_code, "http_error", str(exc.detail))


@app.exception_handler(RequestValidationError)
async def _invalid(_request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", [])[1:])
    return _error(422, "invalid_request", f"{where}: {first.get('msg', 'invalid')}" if where else "The request was not valid.")


# ---------- routes ----------
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": VERSION, "ai_configured": studio_ai.configured(), "sync_configured": store.configured()}


@app.get("/api/sections", response_model=list[Section])
async def list_sections():
    return feeds.SECTIONS


def _clean_topics(sections: Sequence[str], keywords: Sequence[str]) -> tuple[list[str], list[str]]:
    secs = [s for s in dict.fromkeys(sections) if s in feeds.SECTION_IDS]
    if not secs:
        raise HTTPException(422, detail={"code": "no_sections", "message": "Pick at least one section."})
    kws = [k.strip()[:60] for k in dict.fromkeys(keywords) if k and k.strip()]
    return secs, kws


@app.post("/api/feed/refresh", response_model=RefreshResponse)
async def refresh(
    body: RefreshRequest,
    make_sources: Annotated[SourceFactory, Depends(get_source_factory)],
    curator: Annotated[Curator | None, Depends(get_curator)],
):
    """Gather news for the reader's topics and pick at most 15 new stories for AI (US-2).

    The app then curates them one by one with /api/feed/curate to show progress; `curate: true`
    does both in one call.
    """
    sections, keywords = _clean_topics(body.sections, body.keywords)
    result = await sources.fetch_all(make_sources(sections, keywords))
    articles = select_for_ai(result.articles, keywords=keywords, known_urls=body.known_urls, now=now())
    fetched_at = iso(now())
    out = RefreshResponse(articles=articles, failed_sources=result.failed, fetched_at=fetched_at)
    if body.curate:
        done = await asyncio.gather(*(curate(a, sections, keywords, curator, fetched_at=fetched_at) for a in articles))
        out.cards = [c for c, _ in done if c is not None]
        statuses = {s for _, s in done}
        out.ai_status = next((s for s in ("offline", "not_configured", "error") if s in statuses), "ok")
    return out


@app.post("/api/feed/curate", response_model=CurateResponse)
async def curate_one(body: CurateRequest, curator: Annotated[Curator | None, Depends(get_curator)]):
    """Curate one article into a card (US-3). Never fails because AI is offline: it answers a headline-only card."""
    card, status = await curate(body.article, body.sections, body.keywords, curator, fetched_at=iso(now()))
    return CurateResponse(card=card, ai_status=status)


@app.post("/api/feed/merge", response_model=MergeResponse)
async def merge(body: MergeRequest):
    """Apply expiry and replacement to a set of cards (US-6). Works without the account database."""
    return MergeResponse(cards=merge_cards(body.cards, body.new_cards, now()))


def _sync_target(user_id: str | None, data: store.Store | None) -> tuple[str, store.Store]:
    if data is None:
        raise HTTPException(409, detail={"code": "sync_not_set_up", "message": "Sync isn't set up yet; everything is kept on this device."})
    if not user_id:
        raise HTTPException(
            409,
            detail={"code": "sync_needs_signin", "message": "Sign in to sync across devices; for now everything is kept on this device."},
        )
    return user_id, data


@app.get("/api/me/state", response_model=StateResponse)
async def read_state(user_id: Annotated[str | None, Depends(get_user_id)], data: Annotated[store.Store | None, Depends(get_store)]):
    uid, st = _sync_target(user_id, data)
    try:
        saved = await st.load(uid) or UserState()
    except store.StoreUnavailable as exc:
        raise HTTPException(503, detail={"code": "data_offline", "message": "Saved on this device, will sync later."}) from exc
    t = now()
    saved = saved.model_copy(update={"cards": merge_cards(saved.cards, [], t)})
    return StateResponse(state=saved, synced_at=iso(t))


@app.put("/api/me/state", response_model=StateResponse)
async def write_state(
    body: UserState,
    user_id: Annotated[str | None, Depends(get_user_id)],
    data: Annotated[store.Store | None, Depends(get_store)],
):
    """Sync this device's copy with the account: both are combined and saved in one step (AC-6.5, AC-6.6, AC-7.1, AC-7.5)."""
    uid, st = _sync_target(user_id, data)
    t = now()
    try:
        merged = await st.sync(uid, lambda stored: merge_states(stored, body, t))
    except store.StoreUnavailable as exc:
        raise HTTPException(503, detail={"code": "data_offline", "message": "Saved on this device, will sync later."}) from exc
    return StateResponse(state=merged, synced_at=iso(t))


@app.get("/api/feeds/check")
async def check_feeds():
    """Ask every default feed once and report which answer with stories (the build's feed check).

    Run on a preview or by the founder; it is behind the same sign-in as the rest of the app.
    """
    seen: dict[str, sources.RssFeed] = {}
    for section, lst in feeds.RSS_FEEDS.items():
        for name, url in lst:
            seen.setdefault(url, sources.RssFeed(name, url, section))
    for s in feeds.SECTIONS:
        url = feeds.google_news_section_url(s.id)
        seen.setdefault(url, sources.RssFeed(f"Google News {s.name}", url, s.id, via="google-news"))

    async def one(src: sources.RssFeed, client) -> dict:
        try:
            got = await asyncio.wait_for(src.fetch(client), sources.TIMEOUT_SECONDS)
            return {"name": src.name, "url": src.url, "ok": len(got) > 0, "stories": len(got), "error": "" if got else "empty"}
        except Exception as exc:  # report every failure, whatever it is
            return {"name": src.name, "url": src.url, "ok": False, "stories": 0, "error": type(exc).__name__}

    import httpx

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(sources.TIMEOUT_SECONDS), follow_redirects=True, headers={"User-Agent": sources.USER_AGENT}
    ) as client:
        results = await asyncio.gather(*(one(s, client) for s in seen.values()))
    return {"checked": len(results), "ok": sum(r["ok"] for r in results), "feeds": sorted(results, key=lambda r: (r["ok"], r["name"]))}
