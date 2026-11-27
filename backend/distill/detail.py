"""Detailed story summaries in bullet points (US-13, added CR-0011).

For a story already in the feed, the server reads the article page (reader.py), gives its main text to Studio AI and
answers a longer summary (4 to 5 sentences) and up to 10 bullet points. Only the AI's summary and points are kept,
never the article text (AC-13.3). Every number must be written in the article: a point or sentence with any other
number is dropped (AC-13.2). Model output is untrusted data: validated, trimmed and de-duplicated.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from . import prompts, studio_ai
from .reader import ArticleReader, Unreadable
from .textutil import numbers_in, shorten

log = logging.getLogger("distill.detail")

MAX_POINTS = 10  # AC-13.6
MIN_POINTS = 2
POINT_LIMIT = 220
SUMMARY_LIMIT = 900  # AC-13.5: about 4 to 5 sentences
SUMMARY_SENTENCES = 5
AI_TIMEOUT_SECONDS = 90.0  # inside the function's 120-second limit, after up to 8 seconds of reading the page

DetailStatus = Literal["ready", "unavailable", "offline", "not_configured", "error"]


class DetailRequest(BaseModel):
    url: str = Field(max_length=2000)
    title: str = Field(max_length=400)
    source_name: str = Field(default="", max_length=120)


class DetailResponse(BaseModel):
    """ready: summary and points are set. unavailable: the page can't be read (don't ask again, AC-13.4).
    offline / not_configured: the AI isn't there (ask again later, AC-13.9). error: the AI's answer was unusable."""

    status: DetailStatus
    summary: str = ""
    points: list[str] = Field(default_factory=list)


class Detailer(Protocol):
    """Returns the AI's raw answer for one article text (a dict shaped like prompts.DETAIL_SCHEMA)."""

    async def write(self, title: str, source_name: str, text: str) -> dict[str, Any]: ...


class StudioAIDetailer:
    async def write(self, title: str, source_name: str, text: str) -> dict[str, Any]:
        reply = await studio_ai.chat(
            [
                {"role": "system", "content": prompts.DETAIL_SYSTEM},
                {"role": "user", "content": prompts.detail_message(title, source_name, text)},
            ],
            json_schema=prompts.DETAIL_SCHEMA,
            temperature=0,
            timeout=AI_TIMEOUT_SECONDS,
        )
        if not isinstance(reply.data, dict):
            raise studio_ai.AIError("The AI answer wasn't JSON.", code="ai_bad_answer")
        return reply.data


def live_detailer() -> Detailer | None:
    return StudioAIDetailer() if studio_ai.configured() else None


class _Answer(BaseModel):
    summary: str = ""
    points: list[Any] = Field(default_factory=list)


_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"“‘'(])")


def _numbers_ok(text: str, allowed: set[float]) -> bool:
    return all(any(abs(n - a) < 1e-9 for a in allowed) for n in numbers_in(text))


def checked_points(raw: list[Any], allowed: set[float]) -> list[str]:
    """Clean bullet points: one line each, no bullet marks, no repeats, no number the article doesn't state."""
    out: list[str] = []
    seen: set[str] = set()
    for p in raw:
        if not isinstance(p, str):
            continue
        p = " ".join(p.split()).lstrip("-•*·–— ").strip()
        if not p or not _numbers_ok(p, allowed):
            continue
        p = shorten(p, POINT_LIMIT)
        if p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
        if len(out) >= MAX_POINTS:
            break
    return out


def checked_summary(raw: str, allowed: set[float]) -> str:
    """At most 5 sentences, each with only numbers the article states."""
    sentences = [s for s in _SENTENCE.split(" ".join(raw.split())) if s and _numbers_ok(s, allowed)]
    return shorten(" ".join(sentences[:SUMMARY_SENTENCES]), SUMMARY_LIMIT)


async def detail(body: DetailRequest, reader: ArticleReader, detailer: Detailer | None) -> DetailResponse:
    if detailer is None:
        return DetailResponse(status="not_configured")  # checked first: nothing is fetched without an AI to read it
    try:
        text = await reader.read(body.url)
    except Unreadable as exc:
        log.info("article unreadable (%s): %s", exc.reason, body.url[:120])
        return DetailResponse(status="unavailable")
    try:
        raw = await detailer.write(body.title, body.source_name, text)
    except studio_ai.AIUnavailable:
        return DetailResponse(status="offline")
    except studio_ai.AIError as exc:
        log.info("AI error for detail: %s", exc.code)
        return DetailResponse(status="error")
    try:
        answer = _Answer.model_validate(raw)
    except ValidationError:
        return DetailResponse(status="error")
    allowed = numbers_in(f"{body.title}\n{text}")
    points = checked_points(answer.points, allowed)
    if len(points) < MIN_POINTS:
        return DetailResponse(status="error")
    return DetailResponse(status="ready", summary=checked_summary(answer.summary, allowed), points=points)
