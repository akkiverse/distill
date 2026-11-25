# ADR-0003: Sync through a data server at home, with the device copy first

- **Status:** Accepted
- **Date:** 2026-11-25
- **Change request:** CR-0001

## Context
The founder decided that saved posts and topics must sync across devices, with Postgres on their own home server rather than a hosted database. Vercel functions are stateless, and the home server can be off.

## Decision
- The browser keeps the working copy (`localStorage`, `version: 1`). Every change is saved there first, so the app never waits for, or depends on, the data server.
- The API syncs with `PUT /api/me/state`: it loads the stored copy, merges (cards by id, the later save or unsave wins, newer topics win, expiry and replacement applied), saves and returns the result. A change that couldn't be sent is marked pending and sent with the next request.
- Storage is one table `api.user_state(user_id, state jsonb, updated_at)` behind PostgREST, reached over Tailscale Funnel, with Caddy checking a shared key (the same pattern as Studio AI). The user id comes from the Studio Accounts token, read with the hub's `studio_auth.py`.
- Without sign-in or without the data server set up, the API answers 409 and the app stays device-only.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Hosted Postgres (Neon) | Always on | The founder chose the home server; a later option |
| Separate tables for topics and cards | Queries per card | More endpoints and migrations for a few dozen rows per person |
| One JSON document per person (chosen) | One read and one upsert per sync; simple merge in Python | No per-card queries (not needed) |

## Consequences
- Two devices editing at once settle on the later choice per card; topics follow the newest edit.
- The merge rules live in Python (`rules.py`) and are tested once; the browser only does the 24-hour expiry itself when the server can't be reached.
