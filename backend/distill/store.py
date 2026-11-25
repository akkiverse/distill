"""Where each person's topics and cards are kept, behind the `Store` adapter.

Live: Postgres on the founder's home server, reached through PostgREST behind Caddy and Tailscale Funnel
(`DATA_ENDPOINT`, `DATA_GATEWAY_KEY`; see data-server/README.md). Tests and local runs: a memory store.
The browser keeps its own copy, so the app keeps working while the data server is off (AC-6.6).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Protocol

import httpx

from .models import UserState

log = logging.getLogger("distill.store")


class StoreUnavailable(Exception):
    """The data server didn't answer; the device keeps the change and syncs later."""


class Store(Protocol):
    async def load(self, user_id: str) -> UserState | None: ...

    async def save(self, user_id: str, state: UserState) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[str, str] = {}
        self.offline = False

    async def load(self, user_id: str) -> UserState | None:
        if self.offline:
            raise StoreUnavailable("offline")
        raw = self.rows.get(user_id)
        return UserState.model_validate_json(raw) if raw else None

    async def save(self, user_id: str, state: UserState) -> None:
        if self.offline:
            raise StoreUnavailable("offline")
        self.rows[user_id] = state.model_dump_json()


class PostgrestStore:
    """Table `user_state(user_id text primary key, state jsonb, updated_at timestamptz)` through PostgREST."""

    def __init__(self, endpoint: str, key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.key = key
        self.transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.endpoint,
            headers={"Authorization": f"Bearer {self.key}", "Accept": "application/json"},
            timeout=httpx.Timeout(10.0, connect=8.0),
            transport=self.transport,
        )

    async def load(self, user_id: str) -> UserState | None:
        try:
            async with self._client() as c:
                r = await c.get("/user_state", params={"user_id": f"eq.{user_id}", "select": "state"})
        except httpx.HTTPError as exc:
            raise StoreUnavailable(type(exc).__name__) from exc
        if r.status_code >= 300:
            log.info("data server answered %s on load", r.status_code)
            raise StoreUnavailable(f"status {r.status_code}")
        rows = r.json()
        if not rows:
            return None
        state = rows[0].get("state")
        return UserState.model_validate(json.loads(state) if isinstance(state, str) else state)

    async def save(self, user_id: str, state: UserState) -> None:
        body = [{"user_id": user_id, "state": state.model_dump(mode="json"), "updated_at": state.updated_at}]
        try:
            async with self._client() as c:
                r = await c.post(
                    "/user_state",
                    json=body,
                    headers={"Prefer": "resolution=merge-duplicates,return=minimal", "Content-Type": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise StoreUnavailable(type(exc).__name__) from exc
        if r.status_code >= 300:
            log.info("data server answered %s on save", r.status_code)
            raise StoreUnavailable(f"status {r.status_code}")


_memory = MemoryStore()


def configured() -> bool:
    return bool(os.environ.get("DATA_ENDPOINT") and os.environ.get("DATA_GATEWAY_KEY"))


def live_store() -> Store | None:
    """The data server when it is set up, otherwise None (everything stays on the device)."""
    if configured():
        return PostgrestStore(os.environ["DATA_ENDPOINT"], os.environ["DATA_GATEWAY_KEY"])
    if os.environ.get("DISTILL_MEMORY_STORE") == "1":  # local runs only
        return _memory
    return None
