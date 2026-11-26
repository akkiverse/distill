"""Request and response models (Pydantic v2). The shapes match docs/spec/SPEC.md "Data model"."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AiStatus = Literal["ok", "offline", "not_configured", "error"]


class Section(BaseModel):
    id: str
    name: str


class Article(BaseModel):
    """A story as a news source gave it: headline and snippet only, never the full text."""

    id: str
    title: str
    snippet: str = ""
    url: str
    source_name: str
    published_at: str | None = None  # ISO 8601, UTC
    section: str  # the section id it was fetched for ("keyword" for keyword searches)
    via: str = ""  # which adapter found it (rss, google-news, gdelt, ...)


class KeyFigure(BaseModel):
    label: str = Field(max_length=80)
    value: float
    unit: str = Field(default="", max_length=24)


class Card(BaseModel):
    id: str
    topic_section: str
    title: str
    source_name: str
    source_url: str
    published_at: str | None = None
    fetched_at: str
    summary: str = Field(default="", max_length=400)
    key_points: list[str] = Field(default_factory=list, max_length=4)
    key_figures: list[KeyFigure] = Field(default_factory=list)
    story_key: str = ""
    relevance: float = 1.0
    saved: bool = False
    saved_changed_at: str | None = None
    ai_status: AiStatus = "ok"
    replaced_at: str | None = None  # when a newer report on the same story replaced an older card (AC-8.6, added CR-0004)


class Topics(BaseModel):
    sections: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    updated_at: str | None = None


class Settings(BaseModel):
    last_refreshed_at: str | None = None
    theme: Literal["system", "light", "dark"] = "system"


class Watchlist(BaseModel):
    """The founder's price watchlist (US-9, added CR-0005): market keys in display order."""

    keys: list[str] = Field(default_factory=list, max_length=10)
    updated_at: str | None = None


class UserState(BaseModel):
    """Everything kept for one person: synced through the Store, mirrored in the browser."""

    version: int = 1
    topics: Topics = Field(default_factory=Topics)
    cards: list[Card] = Field(default_factory=list)
    settings: Settings = Field(default_factory=Settings)
    watchlist: Watchlist = Field(default_factory=Watchlist)  # absent in copies saved before v0.4.0 (CR-0005)
    updated_at: str | None = None


class RefreshRequest(BaseModel):
    sections: list[str] = Field(min_length=1, max_length=12)
    keywords: list[str] = Field(default_factory=list, max_length=10)
    known_story_keys: list[str] = Field(default_factory=list, max_length=500)
    known_urls: list[str] = Field(default_factory=list, max_length=500)
    curate: bool = False  # True: also curate here (one call); the app curates card by card instead


class RefreshResponse(BaseModel):
    articles: list[Article]
    failed_sources: list[str]
    cards: list[Card] = Field(default_factory=list)
    ai_status: AiStatus | None = None
    fetched_at: str


class CurateRequest(BaseModel):
    article: Article
    sections: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class CurateResponse(BaseModel):
    card: Card | None  # None: the AI judged the story not useful (relevance below 0.5)
    ai_status: AiStatus


class MergeRequest(BaseModel):
    cards: list[Card] = Field(default_factory=list)
    new_cards: list[Card] = Field(default_factory=list)


class MergeResponse(BaseModel):
    cards: list[Card]


class StateResponse(BaseModel):
    state: UserState
    synced_at: str
