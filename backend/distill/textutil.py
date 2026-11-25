"""Small text helpers: cleaning snippets, comparing titles, finding numbers."""

from __future__ import annotations

import hashlib
import html
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")
_WORD = re.compile(r"[a-z0-9]+")
_NUMBER = re.compile(r"(?<![\w.])[-+]?\d[\d,]*(?:\.\d+)?")
_TRACKING = re.compile(r"^(utm_|fbclid|gclid|ref$|cmp$|ns_|at_)")
# Very common words carry no meaning when comparing two headlines.
_STOP = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "has",
        "have",
        "in",
        "is",
        "it",
        "its",
        "of",
        "on",
        "or",
        "that",
        "the",
        "to",
        "was",
        "were",
        "will",
        "with",
        "after",
        "over",
        "says",
        "said",
        "new",
    ]
)


def clean_text(raw: str | None, limit: int = 600) -> str:
    """HTML to plain text, collapsed spaces, at most `limit` characters."""
    if not raw:
        return ""
    text = _SPACE.sub(" ", html.unescape(_TAG.sub(" ", raw))).strip()
    return shorten(text, limit)


def shorten(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut[limit // 2 :]:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,.;:-") + "…"


def words(title: str) -> set[str]:
    return {w for w in _WORD.findall(title.lower()) if w not in _STOP}


def word_overlap(a: str, b: str) -> float:
    """Share of meaningful words two titles have in common (Jaccard: shared / all distinct)."""
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def normalise_url(url: str) -> str:
    """Same story, same URL: drop the fragment, tracking parameters, 'www.' and a trailing slash."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return url.strip()
    host = parts.netloc.lower().removeprefix("www.")
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not _TRACKING.match(k.lower())])
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(("https", host, path, query, ""))


def article_id(url: str) -> str:
    return hashlib.sha1(normalise_url(url).encode()).hexdigest()[:16]


def numbers_in(text: str) -> set[float]:
    """Every number written in the text: '1,23,450' and '123450' are the same, '72.5' stays 72.5."""
    out: set[float] = set()
    for m in _NUMBER.findall(text):
        try:
            out.add(float(m.replace(",", "")))
        except ValueError:
            continue
    return out


def story_key(text: str) -> str:
    """A short lowercase key with hyphens, from the AI's story key or the headline."""
    ws = [w for w in _WORD.findall(text.lower()) if w not in _STOP][:8]
    return "-".join(ws)[:60]
