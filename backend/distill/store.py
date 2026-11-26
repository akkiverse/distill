"""Where each person's topics and cards are kept, behind the `Store` adapter.

Live: the account database, hosted Postgres (Neon) connected to the Vercel project as `DATABASE_URL` (see ADR-0004).
Previews, tests and local runs have no `DATABASE_URL`: everything stays on the device, or in a memory store.
The browser keeps its own copy first, so the app keeps working while the database can't be reached (AC-6.6, AC-7.4).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any, Protocol

from .models import UserState

log = logging.getLogger("distill.store")

Merge = Callable[[UserState], UserState]


class StoreUnavailable(Exception):
    """The database didn't answer; the device keeps the change and syncs later."""


class Store(Protocol):
    async def load(self, user_id: str) -> UserState | None: ...

    async def sync(self, user_id: str, merge: Merge) -> UserState:
        """Combine the stored copy (empty if none) with `merge` and save the result, as one step."""
        ...


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[str, str] = {}
        self.offline = False

    async def load(self, user_id: str) -> UserState | None:
        if self.offline:
            raise StoreUnavailable("offline")
        raw = self.rows.get(user_id)
        return UserState.model_validate_json(raw) if raw else None

    async def sync(self, user_id: str, merge: Merge) -> UserState:
        merged = merge(await self.load(user_id) or UserState())
        self.rows[user_id] = merged.model_dump_json()
        return merged


# One row per person. The same shape the v0.1.0 data server used, so a copied row reads unchanged (AC-7.6).
CREATE_TABLE = """
create table if not exists distill_user_state (
  user_id    text primary key check (length(user_id) between 1 and 100),
  state      jsonb not null,
  updated_at timestamptz not null default now()
)
"""
SELECT_STATE = "select state from distill_user_state where user_id = %s"
# A first sync from two devices at once: make the row exist (empty) so both lock the same row.
SEED_STATE = "insert into distill_user_state (user_id, state) values (%s, '{}'::jsonb) on conflict (user_id) do nothing"
LOCK_STATE = "select state from distill_user_state where user_id = %s for update"
UPSERT_STATE = """
insert into distill_user_state (user_id, state, updated_at) values (%s, %s, now())
on conflict (user_id) do update set state = excluded.state, updated_at = excluded.updated_at
"""


def _state(value: Any) -> UserState:
    return UserState.model_validate_json(value) if isinstance(value, str | bytes) else UserState.model_validate(value)


class PostgresStore:
    """Topics and cards in Postgres (Neon). A short connection per request: Vercel functions keep nothing between calls."""

    def __init__(self, url: str, connect_timeout: int = 8) -> None:
        self.url = url
        self.connect_timeout = connect_timeout
        self.table_ready = False

    async def _connect(self):
        import psycopg  # imported here so the app starts even if the driver can't load

        try:
            # prepare_threshold=None: Neon's pooled address doesn't keep prepared statements between calls.
            conn = await psycopg.AsyncConnection.connect(self.url, connect_timeout=self.connect_timeout, prepare_threshold=None)
        except psycopg.Error as exc:
            log.info("account database didn't answer: %s", type(exc).__name__)
            raise StoreUnavailable(type(exc).__name__) from exc
        if not self.table_ready:
            try:
                # AC-7.2: the one table is made the first time it's needed. The lock stops two cold starts racing on it.
                await conn.execute("select pg_advisory_xact_lock(hashtext('distill_user_state'))")
                await conn.execute(CREATE_TABLE)
                await conn.commit()
            except psycopg.Error as exc:
                await conn.close()
                log.info("couldn't create the Distill table: %s", type(exc).__name__)
                raise StoreUnavailable(type(exc).__name__) from exc
            self.table_ready = True
        return conn

    async def load(self, user_id: str) -> UserState | None:
        import psycopg

        conn = await self._connect()
        try:
            async with conn:
                row = await (await conn.execute(SELECT_STATE, (user_id,))).fetchone()
        except psycopg.Error as exc:
            log.info("account database failed on load: %s", type(exc).__name__)
            raise StoreUnavailable(type(exc).__name__) from exc
        return _state(row[0]) if row else None

    async def sync(self, user_id: str, merge: Merge) -> UserState:
        """Read, combine and save inside one transaction, with the row locked, so two devices can't overwrite each other (AC-7.5)."""
        import psycopg
        from psycopg.types.json import Jsonb

        conn = await self._connect()
        try:
            async with conn, conn.transaction():
                await conn.execute(SEED_STATE, (user_id,))
                row = await (await conn.execute(LOCK_STATE, (user_id,))).fetchone()
                merged = merge(_state(row[0]) if row else UserState())
                await conn.execute(UPSERT_STATE, (user_id, Jsonb(merged.model_dump(mode="json"))))
        except psycopg.Error as exc:
            log.info("account database failed on save: %s", type(exc).__name__)
            raise StoreUnavailable(type(exc).__name__) from exc
        return merged


_memory = MemoryStore()
_live: PostgresStore | None = None


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "").strip()


def configured() -> bool:
    return bool(database_url())


def live_store() -> Store | None:
    """The account database when it is set up, otherwise None (everything stays on the device)."""
    global _live
    url = database_url()
    if url:
        if _live is None or _live.url != url:
            _live = PostgresStore(url)
        return _live
    if os.environ.get("DISTILL_MEMORY_STORE") == "1":  # local runs only
        return _memory
    return None
