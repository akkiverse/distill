"""Read a story's article page on the server and keep only its main text (US-13, added CR-0011).

Behind the `ArticleReader` adapter: the live reader fetches the publisher's page with an 8-second limit and pulls the
paragraphs of the main article out of the HTML; tests use a mock. The text is used only to write the detailed
summary and is never stored (AC-13.3). Anything that stops a clean read (a paywall, a block, a slow site, a page
with too little text) is "unreadable" (AC-13.4), never an error the reader sees.
"""

from __future__ import annotations

from html.parser import HTMLParser
from typing import Protocol
from urllib.parse import urljoin, urlsplit

import httpx

from .catalog import address_problem
from .sources import USER_AGENT

READ_SECONDS = 8.0
MAX_BYTES = 2_000_000  # bigger pages are cut here; the article text is near the top
MAX_REDIRECTS = 4
MIN_TEXT = 400  # fewer characters than this is a teaser, a paywall or a cookie wall, not an article
MAX_TEXT = 12_000  # what the AI is given at most


class Unreadable(Exception):
    """The article page couldn't be read well enough to summarise (AC-13.4). `reason` is for logs only."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class ArticleReader(Protocol):
    async def read(self, url: str) -> str:
        """The article's main text, or raise Unreadable."""
        ...


_SKIP = frozenset(
    {"script", "style", "noscript", "template", "svg", "nav", "header", "footer", "aside", "form", "figure", "button", "select"}
)
_BLOCKS = frozenset({"p", "li", "h2", "h3", "blockquote"})
_VOID = frozenset({"br", "img", "hr", "meta", "link", "input", "source", "wbr", "area", "base", "col", "embed", "param", "track"})


class _MainText(HTMLParser):
    """Collects paragraph text, separately for text inside <article>/<main> and for the whole page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.main = 0
        self.block: list[str] | None = None
        self.in_main: list[str] = []
        self.everywhere: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in _VOID:
            return
        if tag in _SKIP:
            self.skip += 1
        elif tag in ("article", "main"):
            self.main += 1
        elif tag in _BLOCKS and self.block is None and not self.skip:
            self.block = []

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in ("article", "main"):
            self.main = max(0, self.main - 1)
        elif tag in _BLOCKS and self.block is not None:
            text = " ".join("".join(self.block).split())
            self.block = None
            if len(text) >= 40:  # captions, bylines and buttons are short
                self.everywhere.append(text)
                if self.main:
                    self.in_main.append(text)

    def handle_data(self, data: str) -> None:
        if self.block is not None and not self.skip:
            self.block.append(data)


def main_text(html: str) -> str:
    """The article's paragraphs as plain text: the ones inside <article>/<main> when there are enough of them."""
    parser = _MainText()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass
    chosen = parser.in_main if len(" ".join(parser.in_main)) >= MIN_TEXT else parser.everywhere
    text = "\n".join(dict.fromkeys(chosen))  # repeated blocks (share boxes, "read more") once
    return text[:MAX_TEXT]


# Google News links open the publisher only through a script, so the server never sees the article.
_NO_ARTICLE_HOSTS = frozenset({"news.google.com", "consent.google.com"})


def _host(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


class HttpArticleReader:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def read(self, url: str) -> str:
        client = self._client or httpx.AsyncClient(
            timeout=httpx.Timeout(READ_SECONDS), follow_redirects=False, headers={"User-Agent": USER_AGENT}
        )
        try:
            html = await self._fetch(client, url)
        finally:
            if self._client is None:
                await client.aclose()
        text = main_text(html)
        if len(text) < MIN_TEXT:
            raise Unreadable("too_little_text")
        return text

    async def _fetch(self, client: httpx.AsyncClient, url: str) -> str:
        for _ in range(MAX_REDIRECTS + 1):
            if address_problem(url):  # never a private-network address, at every hop
                raise Unreadable("bad_address")
            if _host(url) in _NO_ARTICLE_HOSTS:  # links that reach the article only through a script in the browser
                raise Unreadable("redirect_page")
            try:
                async with client.stream("GET", url, headers={"Accept": "text/html,application/xhtml+xml"}) as r:
                    if r.is_redirect and r.headers.get("location"):
                        url = urljoin(url, r.headers["location"])
                        continue
                    if r.status_code != 200:
                        raise Unreadable(f"status_{r.status_code}")
                    kind = r.headers.get("content-type", "")
                    if "html" not in kind:
                        raise Unreadable("not_html")
                    body = bytearray()
                    async for chunk in r.aiter_bytes():
                        body += chunk
                        if len(body) >= MAX_BYTES:
                            break
                    return body.decode(r.encoding or "utf-8", errors="replace")
            except httpx.TimeoutException as exc:
                raise Unreadable("timeout") from exc
            except httpx.HTTPError as exc:
                raise Unreadable("unreachable") from exc
        raise Unreadable("too_many_redirects")


def live_reader() -> ArticleReader:
    return HttpArticleReader()
