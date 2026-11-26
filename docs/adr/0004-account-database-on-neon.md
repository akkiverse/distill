# ADR-0004: Keep each person's data in a hosted Postgres (Neon)

- **Status:** Accepted
- **Date:** 2026-11-26
- **Change request:** CR-0002
- **Supersedes:** the storage part of [ADR-0003](0003-sync-through-home-data-server.md) (the device-first copy and merge rules stay)

## Context
ADR-0003 put sync on a data server at the founder's home (PostgREST and Caddy in front of Postgres, reached through Tailscale Funnel). On 26 Nov 2026 the founder chose Neon instead, so that sync doesn't depend on a home machine being on, and so usage can be checked in Neon's dashboard. The founder connected a Neon database to the `distill` Vercel project as `DATABASE_URL` (Production only, Singapore, next to the app's `sin1` region). Distill is for up to 4 people.

## Decision
- `PostgresStore` connects to `DATABASE_URL` with `psycopg` 3 (async), one short connection per request, with prepared statements off so Neon's pooled address works too.
- One table, `distill_user_state(user_id text primary key, state jsonb, updated_at timestamptz)`: the same one-document-per-person shape as v0.1.0. It is created with `create table if not exists` on the first connection of each function instance, under an advisory lock so two cold starts can't race.
- A sync reads, merges and saves in one transaction with the person's row locked (`select ... for update`, after making sure the row exists), so simultaneous syncs from two devices both survive.
- No `DATABASE_URL` (previews, tests, local runs) means no live store: the app stays device-only, exactly as before the database existed. Any database error becomes `StoreUnavailable`, answered as 503 `data_offline` ("Saved on this device, will sync later").
- The home-server adapter and its settings (`DATA_ENDPOINT`, `DATA_GATEWAY_KEY`) are removed; `data-server/` is marked as no longer used.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Keep the home data server | No hosted service | Sync stops when the home machine is off; usage hard to see; the founder chose against it |
| Neon over its HTTP SQL endpoint (httpx only) | No database driver | Neon-specific protocol, harder to test locally |
| Neon with `psycopg` 3 (chosen) | Standard Postgres; tested against a real local Postgres; works with `sslmode` and `channel_binding` in Neon's address | One more dependency (binary wheel) |
| A table per topic and card | Per-card queries | More migrations for a few dozen rows per person |

## Consequences
- Sync is available whenever Neon is; Neon's free compute may take a moment to wake, covered by an 8-second connect limit and the device-first copy.
- Tests start a throwaway Postgres; CI fails if Postgres isn't installed there.
- A later storage change replaces only `store.py`; the API and the browser are unaffected.
