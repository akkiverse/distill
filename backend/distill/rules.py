"""Expiry, replacement and sync rules for cards (US-6). Pure functions, used by the API and its tests."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from .models import Card, Topics, UserState
from .textutil import word_overlap

EXPIRY = timedelta(hours=24)  # AC-6.1
SAME_STORY_OVERLAP = 0.6  # AC-6.3


def parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=UTC)
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=UTC)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def is_expired(card: Card, now: datetime) -> bool:
    """Unsaved cards go 24 hours after they were fetched; saved ones stay (AC-6.1, AC-6.2, AC-6.4)."""
    return not card.saved and now - parse_time(card.fetched_at) > EXPIRY


def same_story(a: Card, b: Card) -> bool:
    """Same topic, and the same AI story key or headlines sharing 60% or more of their words (AC-6.3)."""
    if a.topic_section != b.topic_section:
        return False
    if a.story_key and a.story_key == b.story_key:
        return True
    return word_overlap(a.title, b.title) >= SAME_STORY_OVERLAP


def _newest_first(cards: Iterable[Card]) -> list[Card]:
    return sorted(cards, key=lambda c: (parse_time(c.fetched_at), parse_time(c.published_at)), reverse=True)


def merge_cards(existing: Iterable[Card], new_cards: Iterable[Card], now: datetime | None = None) -> list[Card]:
    """Add new cards, let a newer card replace an older unsaved card on the same story, drop expired ones.

    A newer card that replaces a card the reader already had gets `replaced_at` (shown as "Updated", AC-8.6).
    Cards with the same id are combined: the saved flag that changed last wins, so saving on one
    device and unsaving on another settles on the later choice (AC-6.5). An AI summary of a story
    always beats a headline-only copy of it, even one a slower device sends later (AC-3.6).
    """
    now = now or datetime.now(UTC)
    existing = list(existing)
    shown_before = {c.id for c in existing}
    by_id: dict[str, Card] = {}
    for c in [*existing, *new_cards]:
        old = by_id.get(c.id)
        if old is None:
            by_id[c.id] = c
            continue
        if (c.ai_status == "ok") != (old.ai_status == "ok"):
            base = c if c.ai_status == "ok" else old  # an AI summary replaces a headline-only copy (AC-3.6)
        else:
            base = c if parse_time(c.fetched_at) >= parse_time(old.fetched_at) else old
        flag = c if parse_time(c.saved_changed_at) > parse_time(old.saved_changed_at) else old
        replaced = max((x for x in (old.replaced_at, c.replaced_at) if x), key=parse_time, default=None)
        by_id[c.id] = base.model_copy(update={"saved": flag.saved, "saved_changed_at": flag.saved_changed_at, "replaced_at": replaced})
    kept: list[Card] = []
    for c in _newest_first(by_id.values()):  # newest first, so each card is compared with newer ones already kept
        if is_expired(c, now):
            continue
        if not c.saved:
            cover = next((i for i, k in enumerate(kept) if same_story(c, k)), None)
            if cover is not None:
                # an older unsaved card on a story a newer card already covers: the newer card says "Updated" (AC-8.6)
                k = kept[cover]
                if c.id in shown_before and not k.replaced_at:  # only a card the reader had before counts
                    kept[cover] = k.model_copy(update={"replaced_at": k.fetched_at})
                continue
        kept.append(c)
    return kept


def newer_topics(a: Topics, b: Topics) -> Topics:
    return b if parse_time(b.updated_at) >= parse_time(a.updated_at) else a


def merge_states(stored: UserState, incoming: UserState, now: datetime | None = None) -> UserState:
    """Combine what the data server has with what a device sends."""
    now = now or datetime.now(UTC)
    last = max(parse_time(stored.settings.last_refreshed_at), parse_time(incoming.settings.last_refreshed_at))
    settings = incoming.settings.model_copy(update={"last_refreshed_at": iso(last) if last.year > 1 else None})
    return UserState(
        topics=newer_topics(stored.topics, incoming.topics),
        cards=merge_cards(stored.cards, incoming.cards, now),
        settings=settings,
        updated_at=iso(now),
    )
