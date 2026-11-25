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

    Cards with the same id are combined: the saved flag that changed last wins, so saving on one
    device and unsaving on another settles on the later choice (AC-6.5).
    """
    now = now or datetime.now(UTC)
    by_id: dict[str, Card] = {}
    for c in [*existing, *new_cards]:
        old = by_id.get(c.id)
        if old is None:
            by_id[c.id] = c
            continue
        base = c if parse_time(c.fetched_at) >= parse_time(old.fetched_at) else old
        flag = c if parse_time(c.saved_changed_at) > parse_time(old.saved_changed_at) else old
        by_id[c.id] = base.model_copy(update={"saved": flag.saved, "saved_changed_at": flag.saved_changed_at})
    kept: list[Card] = []
    for c in _newest_first(by_id.values()):  # newest first, so each card is compared with newer ones already kept
        if is_expired(c, now):
            continue
        if not c.saved and any(same_story(c, k) for k in kept):
            continue  # an older unsaved card on a story a newer card already covers
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
