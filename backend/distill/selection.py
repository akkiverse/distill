"""From everything the sources returned to the few stories worth sending to AI (US-2)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, datetime, timedelta

from .models import Article
from .textutil import normalise_url, word_overlap

MAX_FOR_AI = 15  # AC-2.4
DUPLICATE_OVERLAP = 0.8  # AC-2.2
MAX_AGE = timedelta(hours=36)  # older stories would expire almost at once


def matching_keyword(article: Article, keywords: Sequence[str]) -> str | None:
    """The first keyword found in the title or snippet, ignoring case (AC-2.1)."""
    text = f"{article.title} {article.snippet}".lower()
    for kw in keywords:
        k = kw.strip().lower()
        if k and k in text:
            return kw.strip()
    return None


def _when(a: Article) -> datetime:
    if a.published_at:
        try:
            return datetime.fromisoformat(a.published_at.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.min.replace(tzinfo=UTC)


def dedupe(articles: Iterable[Article]) -> list[Article]:
    """One copy of each story: same URL, or headlines sharing 80% or more of their words (AC-2.2).

    The copy with a snippet (more for the AI to work with) and the publisher's own link wins.
    """
    ranked = sorted(articles, key=lambda a: (bool(a.snippet), a.via != "google-news", _when(a)), reverse=True)
    kept: list[Article] = []
    urls: set[str] = set()
    for a in ranked:
        u = normalise_url(a.url)
        if u in urls or any(word_overlap(a.title, k.title) >= DUPLICATE_OVERLAP for k in kept):
            continue
        urls.add(u)
        kept.append(a)
    return kept


def select_for_ai(
    articles: Iterable[Article],
    *,
    keywords: Sequence[str] = (),
    known_urls: Iterable[str] = (),
    now: datetime | None = None,
    limit: int = MAX_FOR_AI,
) -> list[Article]:
    """Filter by keyword, drop stories already in the feed, remove duplicates, keep the newest `limit`.

    With keywords, only stories that mention one of them go on (AC-2.1); keyword searches are filed
    under "kw:<keyword>" so each keyword works like its own topic. Sections take turns so one busy
    section can't fill all the places.
    """
    now = now or datetime.now(UTC)
    known = {normalise_url(u) for u in known_urls}
    keep: list[Article] = []
    for a in articles:
        if normalise_url(a.url) in known:
            continue
        if a.published_at and now - _when(a) > MAX_AGE:
            continue
        if keywords:
            kw = matching_keyword(a, keywords)
            if kw is None:
                continue
            if a.section == "keyword":
                a = a.model_copy(update={"section": f"kw:{kw.lower()}"})
        keep.append(a)
    unique = sorted(dedupe(keep), key=_when, reverse=True)
    by_section: dict[str, list[Article]] = {}
    for a in unique:
        by_section.setdefault(a.section, []).append(a)
    picked: list[Article] = []
    while len(picked) < limit and any(by_section.values()):
        for queue in by_section.values():
            if queue and len(picked) < limit:
                picked.append(queue.pop(0))
    return sorted(picked, key=_when, reverse=True)
