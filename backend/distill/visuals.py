"""The AI's cover theme and story diagram (US-11, added CR-0008).

The model picks a short theme for the card's cover and, when the story suits one, one diagram: bars, change, trend or steps.
Its answer is untrusted data: every number must be written in the headline or snippet (as AC-3.3), sizes and counts are limited,
and a diagram that fails a check is dropped, so the card falls back to the key-figure chart (AC-4.2).
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from .models import Article, Visual, VisualPoint
from .textutil import numbers_in, shorten

COVER_LIMIT = 40  # AC-11.4
COVER_WORDS = (2, 5)
STEP_LIMIT = 60  # AC-11.5
LABEL_LIMIT = 40
TITLE_LIMIT = 70
POINTS = {"bars": (2, 6), "change": (2, 2), "trend": (3, 8)}
STEPS = (2, 5)

_CTRL = re.compile(r"[\x00-\x1f\x7f]")


def _clean(text: Any, limit: int) -> str:
    return shorten(" ".join(_CTRL.sub(" ", str(text or "")).split()).strip(" -•*\"'"), limit)


def checked_cover(raw: Any) -> str:
    """AC-11.4: 2 to 5 words, at most 40 characters; anything else gives no theme (the cover shows the topic's name)."""
    text = _clean(raw, 200)
    n = len(text.split())
    if not (COVER_WORDS[0] <= n <= COVER_WORDS[1]) or len(text) > COVER_LIMIT:
        return ""
    return text


class _Point(BaseModel):
    label: str = ""
    value: float


class _RawVisual(BaseModel):
    kind: Literal["bars", "change", "trend", "steps", "none"] = "none"
    title: str = ""
    unit: str = ""
    points: list[_Point] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)


def checked_visual(raw: Any, article: Article) -> Visual | None:
    """AC-11.5: keep the diagram only when it passes every check; otherwise None."""
    if not isinstance(raw, dict):
        return None
    try:
        v = _RawVisual.model_validate(raw)
    except ValidationError:
        return None
    title = _clean(v.title, TITLE_LIMIT)
    if v.kind == "none":
        return None
    if v.kind == "steps":
        steps: list[str] = []
        for s in v.steps:
            s = _clean(s, 200)
            if not s or len(s) > STEP_LIMIT or s.lower() in {x.lower() for x in steps}:
                return None  # a step too long to show as written isn't shortened into something the story didn't say
            steps.append(s)
        if not (STEPS[0] <= len(steps) <= STEPS[1]):
            return None
        return Visual(kind="steps", title=title, steps=steps)
    low, high = POINTS[v.kind]
    if not (low <= len(v.points) <= high):
        return None
    found = numbers_in(f"{article.title} {article.snippet}")
    points: list[VisualPoint] = []
    for p in v.points:
        if not any(abs(p.value - n) < 1e-9 for n in found):
            return None  # one invented number spoils the whole picture
        label = _clean(p.label, LABEL_LIMIT)
        if not label and v.kind != "change":
            return None
        points.append(VisualPoint(label=label, value=p.value))
    if v.kind == "change" and points[0].value == points[1].value:
        return None
    return Visual(kind=v.kind, title=title, unit=_clean(v.unit, 24), points=points)
