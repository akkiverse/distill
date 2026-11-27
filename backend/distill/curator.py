"""AI curation (US-3): keep only useful stories and turn each into a card, behind the `Curator` adapter.

The live adapter uses the Studio AI kit; tests use a mock. Model output is treated as untrusted data:
it is validated, trimmed, and any number not found in the source text is dropped (AC-3.3).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from . import prompts, studio_ai, visuals
from .models import AiStatus, Article, Card, KeyFigure
from .textutil import numbers_in, shorten, story_key

log = logging.getLogger("distill.curator")

MIN_RELEVANCE = 0.5  # AC-3.1
SUMMARY_LIMIT = 400  # AC-3.2
MAX_FIGURES = 6
AI_TIMEOUT_SECONDS = 75.0  # below the function's 120-second limit, so the fallback can still answer


class Curator(Protocol):
    """Returns the AI's raw verdict for one article (a dict shaped like prompts.SCHEMA)."""

    async def judge(self, article: Article, sections: Sequence[str], keywords: Sequence[str]) -> dict[str, Any]: ...


class StudioAICurator:
    async def judge(self, article: Article, sections: Sequence[str], keywords: Sequence[str]) -> dict[str, Any]:
        reply = await studio_ai.chat(
            [{"role": "system", "content": prompts.SYSTEM}, {"role": "user", "content": prompts.user_message(article, sections, keywords)}],
            json_schema=prompts.SCHEMA,
            temperature=0,
            timeout=AI_TIMEOUT_SECONDS,
        )
        if not isinstance(reply.data, dict):
            raise studio_ai.AIError("The AI answer wasn't JSON.", code="ai_bad_answer")
        return reply.data


def live_curator() -> Curator | None:
    """The Studio AI curator when AI is set up for this app, otherwise None (headline-only cards)."""
    return StudioAICurator() if studio_ai.configured() else None


class _Figure(BaseModel):
    label: str
    value: float
    unit: str = ""


class _Verdict(BaseModel):
    relevance: float = Field(ge=0, le=1)
    summary: str
    key_points: list[str] = Field(default_factory=list)
    key_figures: list[_Figure] = Field(default_factory=list)
    story_key: str = ""
    cover: Any = ""  # AC-11.4 (added CR-0008): checked in visuals.py, never trusted as given
    visual: Any = None  # AC-11.5


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def headline_card(article: Article, ai_status: AiStatus, fetched_at: str | None = None) -> Card:
    """A card with only the headline and source, used while AI is offline or not set up (AC-3.4)."""
    return Card(
        id=article.id,
        topic_section=article.section,
        title=article.title,
        source_name=article.source_name,
        source_url=article.url,
        published_at=article.published_at,
        fetched_at=fetched_at or _now(),
        story_key=story_key(article.title),
        relevance=1.0,
        ai_status=ai_status,
    )


_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def _points(raw: list[str], article: Article) -> list[str]:
    points: list[str] = []
    for p in raw:
        p = shorten(" ".join(str(p).split()).lstrip("-•* "), 160)
        if p and p.lower() not in {x.lower() for x in points}:
            points.append(p)
    # AC-3.2 asks for 2 to 4 points: fill from the snippet, then the headline, if the AI gave fewer.
    for extra in [*_SENTENCE.split(article.snippet), article.title]:
        if len(points) >= 2:
            break
        extra = shorten(extra.strip(), 160)
        if extra and extra.lower() not in {x.lower() for x in points}:
            points.append(extra)
    return points[:4]


def checked_figures(figures: list[_Figure], article: Article) -> list[KeyFigure]:
    """Only figures whose number is written in the headline or snippet survive (AC-3.3)."""
    found = numbers_in(f"{article.title} {article.snippet}")
    out: list[KeyFigure] = []
    for f in figures:
        if any(abs(f.value - n) < 1e-9 for n in found):
            out.append(KeyFigure(label=shorten(f.label.strip() or "Figure", 80), value=f.value, unit=shorten(f.unit.strip(), 24)))
    return out[:MAX_FIGURES]


async def curate(
    article: Article, sections: Sequence[str], keywords: Sequence[str], curator: Curator | None, *, fetched_at: str | None = None
) -> tuple[Card | None, AiStatus]:
    """One article to one card (or None when the AI says it isn't useful)."""
    if curator is None:
        return headline_card(article, "not_configured", fetched_at), "not_configured"
    try:
        raw = await curator.judge(article, sections, keywords)
    except studio_ai.AIUnavailable:
        return headline_card(article, "offline", fetched_at), "offline"
    except studio_ai.AIError as exc:
        log.info("AI error for %s: %s", article.id, exc.code)
        return headline_card(article, "error", fetched_at), "error"
    try:
        v = _Verdict.model_validate(raw)
    except ValidationError:
        log.info("AI answer for %s didn't match the schema", article.id)
        return headline_card(article, "error", fetched_at), "error"
    if v.relevance < MIN_RELEVANCE:
        return None, "ok"
    summary = shorten(" ".join(v.summary.split()), SUMMARY_LIMIT) or shorten(article.snippet, SUMMARY_LIMIT)
    return (
        Card(
            id=article.id,
            topic_section=article.section,
            title=article.title,
            source_name=article.source_name,
            source_url=article.url,
            published_at=article.published_at,
            fetched_at=fetched_at or _now(),
            summary=summary,
            key_points=_points(v.key_points, article),
            key_figures=checked_figures(v.key_figures, article),
            story_key=story_key(v.story_key) or story_key(article.title),
            relevance=round(v.relevance, 3),
            ai_status="ok",
            cover=visuals.checked_cover(v.cover),
            visual=visuals.checked_visual(v.visual, article),
        ),
        "ok",
    )
