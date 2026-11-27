"""Who sees prices from the studio's Zerodha connection (AC-9.8, changed CR-0012; AC-14.9 to AC-14.11).

Founder's decision, 27 Nov 2026: every signed-in person may search, add and see Zerodha (`kite`) items, unless the founder
turns the admin switch "Share Zerodha prices with other users" Off, which brings back the earlier rule (the founder only).
The switch is one JSON document in the account database (`distill_settings`, key `market_sharing`, the table CR-0010 made),
so changing it needs no release. Without a database (previews, tests, local runs) it lives in this server's memory.

Safe side: if the stored switch can't be read, Zerodha items go back to the founder only until it can (AC-14.10).
A person's own watchlist and pins are untouched by this: they stay in their own account row (AC-14.11).
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime

from pydantic import BaseModel

from .catalog import CREATE_TABLE

log = logging.getLogger("distill.sharing")

KEY = "market_sharing"
DEFAULT_ON = True  # the founder's decision: shared unless switched Off
CACHE_SECONDS = 30.0  # a change reaches every server within half a minute
SELECT = "select value from distill_settings where key = %s"
UPSERT = """
insert into distill_settings (key, value, updated_at) values (%s, %s, now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
"""


class Sharing(BaseModel):
    share_kite: bool = DEFAULT_ON
    updated_at: str | None = None


class SharingUnavailable(Exception):
    """The account database didn't answer."""


class SharingStore:
    async def load(self) -> Sharing: ...

    async def save(self, value: Sharing) -> Sharing: ...


class MemorySharing(SharingStore):
    def __init__(self, value: Sharing | None = None) -> None:
        self.value = value or Sharing()
        self.offline = False

    async def load(self) -> Sharing:
        if self.offline:
            raise SharingUnavailable("offline")
        return self.value.model_copy()

    async def save(self, value: Sharing) -> Sharing:
        if self.offline:
            raise SharingUnavailable("offline")
        self.value = value.model_copy()
        return self.value


class PostgresSharing(SharingStore):
    """The switch in the account database: one row in `distill_settings`."""

    def __init__(self, url: str, connect_timeout: int = 6) -> None:
        self.url = url
        self.connect_timeout = connect_timeout
        self.table_ready = False

    async def _run(self, work):
        try:
            import psycopg
        except ImportError as exc:
            raise SharingUnavailable("driver") from exc
        try:
            conn = await psycopg.AsyncConnection.connect(self.url, connect_timeout=self.connect_timeout, prepare_threshold=None)
            async with conn:
                if not self.table_ready:
                    await conn.execute("select pg_advisory_xact_lock(hashtext('distill_settings'))")
                    await conn.execute(CREATE_TABLE)
                    await conn.commit()
                    self.table_ready = True
                return await work(conn)
        except psycopg.Error as exc:
            raise SharingUnavailable(type(exc).__name__) from exc

    async def load(self) -> Sharing:
        async def work(conn):
            row = await (await conn.execute(SELECT, (KEY,))).fetchone()
            if not row:
                return Sharing()
            v = row[0]
            return Sharing.model_validate_json(v) if isinstance(v, str | bytes) else Sharing.model_validate(v)

        return await self._run(work)

    async def save(self, value: Sharing) -> Sharing:
        from psycopg.types.json import Jsonb

        async def work(conn):
            await conn.execute(UPSERT, (KEY, Jsonb(value.model_dump(mode="json"))))
            await conn.commit()
            return value

        return await self._run(work)


_memory = MemorySharing()
_live: PostgresSharing | None = None
_cache: tuple[float, int, bool] | None = None


def live_sharing() -> SharingStore:
    """The account database when it is set up, otherwise this server's memory."""
    global _live
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        if _live is None or _live.url != url:
            _live = PostgresSharing(url)
        return _live
    return _memory


def forget_cache() -> None:
    global _cache
    _cache = None


async def share_kite(store: SharingStore) -> bool:
    """AC-14.10: whether Zerodha items are shared now, read at most every 30 seconds per server; Off if it can't be read."""
    global _cache
    now = time.monotonic()
    if _cache and _cache[1] == id(store) and now - _cache[0] < CACHE_SECONDS:
        return _cache[2]
    try:
        on = (await store.load()).share_kite
    except SharingUnavailable as exc:
        log.info("sharing switch unreadable (%s): Zerodha items for the founder only", exc)
        return False
    except Exception:
        log.exception("sharing switch damaged: Zerodha items for the founder only")
        return False
    _cache = (now, id(store), on)
    return on


async def change(store: SharingStore, on: bool, at: datetime | None = None) -> Sharing:
    """AC-14.9: the founder flips the switch; every server picks it up within 30 seconds (this one at once)."""
    at = at or datetime.now(UTC)
    saved = await store.save(Sharing(share_kite=on, updated_at=at.astimezone(UTC).isoformat().replace("+00:00", "Z")))
    forget_cache()
    return saved
