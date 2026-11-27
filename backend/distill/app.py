"""Distill API (FastAPI). Every route is under /api; the React interface calls it."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import catalog, feeds, market, sources, store, studio_ai, studio_auth
from . import curator as curator_mod
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
from .rules import iso, merge_cards, merge_states, upgrade_watchlist
from .selection import select_for_ai

VERSION = "0.1.0"
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Distill API", version=VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
studio_ai.install(app)

SourceFactory = Callable[..., list[sources.NewsSource]]  # (sections, keywords, *, entries, off)


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


def get_market() -> market.MarketData | None:
    return market.live_market()


def get_user_role(request: Request) -> str | None:
    """The person's Studio Accounts role for Distill ("admin" is the founder), or None when signed out."""
    claims = studio_auth.optional_user(request)
    return str(claims.get("role") or "") or None if claims else None


def get_catalog() -> catalog.CatalogStore:
    """The founder's news source list (CR-0010)."""
    return catalog.live_catalog()


def get_feed_checker() -> catalog.Checker:
    """Checks a feed address from the server before it is saved (AC-12.3)."""
    return catalog.check_feed


def get_service_probe():
    """Asks GDELT or a keyed service once, for the admin screen's "Check all now"."""
    return probe_service


async def probe_service(entry: catalog.SourceEntry) -> catalog.FeedCheck:
    env = dict(os.environ)
    keyed = {"guardian": sources.Guardian, "newsdata": sources.NewsData, "currents": sources.Currents, "marketaux": sources.Marketaux}
    if entry.kind == "gdelt":
        src: sources.NewsSource = sources.Gdelt(["India"])
    elif entry.kind in keyed and env.get(entry.key_env() or ""):
        src = keyed[entry.kind](env[entry.key_env() or ""], "India", "india")
    else:
        return catalog.FeedCheck(False, code="needs_key", message="Needs a key")
    import httpx

    async with httpx.AsyncClient(timeout=httpx.Timeout(catalog.CHECK_SECONDS), headers={"User-Agent": sources.USER_AGENT}) as client:
        try:
            got = await asyncio.wait_for(src.fetch(client), catalog.CHECK_SECONDS)
        except TimeoutError:
            return catalog.FeedCheck(False, code="timeout", message=catalog.REASONS["timeout"])
        except httpx.HTTPStatusError as exc:
            return catalog.FeedCheck(False, code="blocked", message=catalog.blocked_status(exc.response.status_code))
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            return catalog.FeedCheck(False, code="unreachable", message=catalog.REASONS["unreachable"])
    return catalog.FeedCheck(
        bool(got), stories=len(got), code="" if got else "no_stories", message="" if got else catalog.REASONS["no_stories"]
    )


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
    return {
        "status": "ok",
        "version": VERSION,
        "ai_configured": studio_ai.configured(),
        "sync_configured": store.configured(),
        "market_configured": market.configured(),
    }


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
    sources_list: Annotated[catalog.CatalogStore, Depends(get_catalog)],
    user_id: Annotated[str | None, Depends(get_user_id)],
):
    """Gather news for the reader's topics and pick at most 15 new stories for AI (US-2).

    The app then curates them one by one with /api/feed/curate to show progress; `curate: true`
    does both in one call.
    """
    sections, keywords = _clean_topics(body.sections, body.keywords)
    entries = await catalog.entries_for_refresh(sources_list)  # AC-12.10: the built-in list if it can't be read
    off = body.sources_off if user_id else []  # AC-12.8: signed-out visitors and the demo use every active source
    result = await sources.fetch_all(make_sources(sections, keywords, entries=entries, off=off))
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
    # AC-10.12: a watchlist saved by v0.4.0 is upgraded as it is read
    saved = saved.model_copy(update={"cards": merge_cards(saved.cards, [], t), "watchlist": upgrade_watchlist(saved.watchlist)})
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


# ---------- prices (US-9, added CR-0005) ----------
def _market(data: market.MarketData | None) -> market.MarketData:
    if data is None:  # AC-9.10
        raise HTTPException(409, detail={"code": "market_not_set_up", "message": "Price source not set up yet."})
    return data


def _market_offline(exc: Exception) -> HTTPException:
    return HTTPException(503, detail={"code": "market_offline", "message": "Prices can't be reached right now."})


MarketDep = Annotated[market.MarketData | None, Depends(get_market)]
RoleDep = Annotated[str | None, Depends(get_user_role)]


@app.get("/api/market/search", response_model=list[market.InstrumentOut])
async def market_search(data: MarketDep, role: RoleDep, q: str = "", group: str = ""):
    """AC-9.1, AC-9.8, AC-10.5: instruments matching a symbol or name (optionally one group: gold, india, us), each with its
    kind and tidy name; Zerodha items only for the founder."""
    try:
        return await market.search(_market(data), q, role, group or None)
    except market.MarketUnavailable as exc:
        raise _market_offline(exc) from exc


@app.post("/api/market/watch", response_model=market.WatchResponse)
async def market_watch(body: market.WatchRequest, data: MarketDep, role: RoleDep):
    """AC-9.3: tell the Market Gateway which keys are wanted (the only market write, AC-9.13)."""
    if len(body.keys) > market.MAX_WATCH:
        raise HTTPException(422, detail={"code": "too_many", "message": f"You can watch up to {market.MAX_WATCH} items."})
    try:
        return await market.watch(_market(data), body.keys, role, now())
    except market.MarketUnavailable as exc:
        raise _market_offline(exc) from exc


@app.get("/api/market/prices", response_model=market.PricesResponse)
async def market_prices(data: MarketDep, role: RoleDep, keys: str = ""):
    """AC-9.4 to AC-9.8: the latest prices for the watchlist, one request for all items."""
    wanted = [k for k in keys.split(",") if k.strip()]
    if len(wanted) > market.MAX_WATCH:
        raise HTTPException(422, detail={"code": "too_many", "message": f"You can watch up to {market.MAX_WATCH} items."})
    try:
        result = await market.prices(_market(data), wanted, role, now())
    except market.MarketUnavailable as exc:
        raise _market_offline(exc) from exc
    return JSONResponse(result.model_dump(mode="json"), headers={"Cache-Control": "no-store"})


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


# ---------- news sources (US-12, added CR-0010) ----------
CatalogDep = Annotated[catalog.CatalogStore, Depends(get_catalog)]
CheckerDep = Annotated[catalog.Checker, Depends(get_feed_checker)]


class PersonSource(BaseModel):
    id: str
    name: str
    sections: list[str]
    kind: str


class PersonSources(BaseModel):
    sources: list[PersonSource]


@app.get("/api/sources", response_model=PersonSources)
async def person_sources(sources_list: CatalogDep):
    """AC-12.6, AC-12.9: the active sources a reader can switch on or off (paused, removed and key-less ones aren't listed)."""
    entries = await catalog.entries_for_refresh(sources_list)
    env = dict(os.environ)
    listed = [e for e in entries if not e.paused and not e.needs_key(env)]
    return PersonSources(sources=[PersonSource(id=e.id, name=e.name, sections=e.sections, kind=e.kind) for e in listed])


class AdminSource(catalog.SourceEntry):
    can_remove: bool = True
    missing_key: bool = False
    key_name: str | None = None  # the Vercel variable that switches a keyed service on


class AdminSources(BaseModel):
    sources: list[AdminSource]
    checked_at: str | None = None
    saved_in_database: bool


class NewSource(BaseModel):
    name: str = Field(max_length=200)
    url: str = Field(max_length=500)
    sections: list[str] = Field(max_length=12)


class SourceChange(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=500)
    sections: list[str] | None = Field(default=None, max_length=12)
    paused: bool | None = None


def require_admin(role: RoleDep) -> str:
    """AC-12.1: the News sources screen and its API are for Distill's admin role only."""
    if role is None:
        raise HTTPException(401, detail={"code": "signin_required", "message": "Sign in as the Distill admin to manage news sources."})
    if role != "admin":
        raise HTTPException(403, detail={"code": "admin_only", "message": "Only the Distill admin can manage news sources."})
    return role


AdminDep = Annotated[str, Depends(require_admin)]


def _admin_view(cat: catalog.Catalog) -> AdminSources:
    env = dict(os.environ)
    out = [AdminSource(**e.model_dump(), can_remove=e.removable, missing_key=e.needs_key(env), key_name=e.key_env()) for e in cat.sources]
    return AdminSources(sources=out, checked_at=cat.checked_at, saved_in_database=store.configured())


def _list_offline(exc: Exception) -> HTTPException:
    return HTTPException(
        503,
        detail={
            "code": "sources_offline",
            "message": "The source list can't be reached right now. Nothing was changed; try again in a moment.",
        },
    )


def _rejected(exc: catalog.SourceRejected) -> HTTPException:
    return HTTPException(exc.status, detail={"code": exc.code, "message": exc.message})


def _duplicate(cat: catalog.Catalog, url: str, except_id: str | None = None) -> None:
    for e in cat.sources:
        if e.id != except_id and e.url and catalog.same_address(e.url, url):
            raise catalog.SourceRejected("duplicate", f"{catalog.REASONS['duplicate']} ({e.name}).", 409)


async def _checked(checker: catalog.Checker, url: str) -> catalog.FeedCheck:
    result = await checker(url)
    if not result.ok:
        raise catalog.SourceRejected(result.code or "check_failed", result.message or "The feed didn't pass the check.")
    return result


@app.get("/api/admin/sources", response_model=AdminSources)
async def admin_sources(_: AdminDep, sources_list: CatalogDep):
    try:
        return _admin_view(await sources_list.load())
    except catalog.CatalogUnavailable as exc:
        raise _list_offline(exc) from exc


@app.post("/api/admin/sources", response_model=AdminSources, status_code=201)
async def add_source(body: NewSource, _: AdminDep, sources_list: CatalogDep, checker: CheckerDep):
    """AC-12.3: a new feed is checked from the server first; only one that answers with stories is saved."""
    try:
        name = catalog.clean_name(body.name)
        sections = catalog.clean_sections(body.sections)
        url = body.url.strip()
        current = await sources_list.load()
        _duplicate(current, url)
        if len(current.sources) >= catalog.MAX_SOURCES:
            raise catalog.SourceRejected("too_many", f"The list holds at most {catalog.MAX_SOURCES} sources. Remove one first.")
        result = await _checked(checker, url)
        t = now()

        def change(cat: catalog.Catalog) -> catalog.Catalog:
            _duplicate(cat, url)
            entry = catalog.SourceEntry(id=catalog.rss_id(url), name=name, url=url, sections=sections, added_at=iso(t), updated_at=iso(t))
            entry.check = catalog.recorded(entry, result, t)
            while cat.get(entry.id):  # the same address in another spelling never collides
                entry.id += "x"
            return cat.model_copy(update={"sources": [*cat.sources, entry], "updated_at": iso(t)})

        saved = await sources_list.update(change)
    except catalog.SourceRejected as exc:
        raise _rejected(exc) from exc
    except catalog.CatalogUnavailable as exc:
        raise _list_offline(exc) from exc
    catalog.forget_cache()
    return _admin_view(saved)


@app.patch("/api/admin/sources/{source_id}", response_model=AdminSources)
async def change_source(source_id: str, body: SourceChange, _: AdminDep, sources_list: CatalogDep, checker: CheckerDep):
    """AC-12.4, AC-12.5: edit a source (a new address is checked first), or pause and resume it."""
    try:
        current = await sources_list.load()
        entry = current.get(source_id)
        if entry is None:
            raise catalog.SourceRejected("not_found", "That source isn't in the list any more. Reload the page.", 404)
        update: dict = {}
        if body.name is not None:
            update["name"] = catalog.clean_name(body.name)
        result: catalog.FeedCheck | None = None
        if entry.kind == "rss":
            if body.sections is not None:
                update["sections"] = catalog.clean_sections(body.sections)
            if body.url is not None and not catalog.same_address(body.url, entry.url):
                url = body.url.strip()
                _duplicate(current, url, except_id=entry.id)
                result = await _checked(checker, url)
                update["url"] = url
            elif body.url is not None:
                update["url"] = body.url.strip()
        elif body.sections is not None or (body.url is not None and body.url.strip() != entry.url):
            raise catalog.SourceRejected("fixed_source", f"{entry.name} is built in: only its name can be changed, and it can be paused.")
        if body.paused is not None:
            update["paused"] = body.paused
        t = now()

        def change(cat: catalog.Catalog) -> catalog.Catalog:
            target = cat.get(source_id)
            if target is None:
                raise catalog.SourceRejected("not_found", "That source isn't in the list any more. Reload the page.", 404)
            if "url" in update and not catalog.same_address(update["url"], target.url):
                _duplicate(cat, update["url"], except_id=source_id)
            new = target.model_copy(update={**update, "updated_at": iso(t)})
            if result is not None:
                new.check = catalog.recorded(new, result, t)
            if "paused" in update and not update["paused"]:
                new.note = ""
            return cat.model_copy(update={"sources": [new if s.id == source_id else s for s in cat.sources], "updated_at": iso(t)})

        saved = await sources_list.update(change)
    except catalog.SourceRejected as exc:
        raise _rejected(exc) from exc
    except catalog.CatalogUnavailable as exc:
        raise _list_offline(exc) from exc
    catalog.forget_cache()
    return _admin_view(saved)


@app.delete("/api/admin/sources/{source_id}", response_model=AdminSources)
async def remove_source(source_id: str, _: AdminDep, sources_list: CatalogDep):
    """AC-12.5: remove a source (the screen asks to confirm first). Google News and GDELT can only be paused."""
    t = now()

    def change(cat: catalog.Catalog) -> catalog.Catalog:
        target = cat.get(source_id)
        if target is None:
            raise catalog.SourceRejected("not_found", "That source isn't in the list any more. Reload the page.", 404)
        if not target.removable:
            raise catalog.SourceRejected("not_removable", f"{target.name} can be paused but not removed.", 409)
        return cat.model_copy(update={"sources": [s for s in cat.sources if s.id != source_id], "updated_at": iso(t)})

    try:
        saved = await sources_list.update(change)
    except catalog.SourceRejected as exc:
        raise _rejected(exc) from exc
    except catalog.CatalogUnavailable as exc:
        raise _list_offline(exc) from exc
    catalog.forget_cache()
    return _admin_view(saved)


@app.post("/api/admin/sources/check", response_model=AdminSources)
async def check_sources(_: AdminDep, sources_list: CatalogDep, checker: CheckerDep, probe: Annotated[Callable, Depends(get_service_probe)]):
    """AC-12.2: ask every source that is on once (8-second limit each, all at once) and keep each one's result."""
    try:
        current = await sources_list.load()
    except catalog.CatalogUnavailable as exc:
        raise _list_offline(exc) from exc
    env = dict(os.environ)
    todo = [e for e in current.sources if not e.paused and not e.needs_key(env)]

    async def one(e: catalog.SourceEntry) -> catalog.FeedCheck:
        try:
            if e.kind == "rss":
                return await checker(e.url)
            if e.kind == "google-news":
                return await checker(feeds.google_news_section_url("world"))
            return await probe(e)
        except Exception:
            return catalog.FeedCheck(False, code="unreachable", message=catalog.REASONS["unreachable"])

    results = dict(zip([e.id for e in todo], await asyncio.gather(*(one(e) for e in todo)), strict=True))
    t = now()

    def change(cat: catalog.Catalog) -> catalog.Catalog:
        updated = [s.model_copy(update={"check": catalog.recorded(s, results[s.id], t)}) if s.id in results else s for s in cat.sources]
        return cat.model_copy(update={"sources": updated, "checked_at": iso(t)})

    try:
        saved = await sources_list.update(change)
    except catalog.CatalogUnavailable as exc:
        raise _list_offline(exc) from exc
    return _admin_view(saved)
