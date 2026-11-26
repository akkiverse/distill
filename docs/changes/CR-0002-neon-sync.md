# CR-0002: Keep topics and saved cards in each person's account (Neon)

- **Status:** In review
- **Requested by:** Founder (board notes)
- **Date:** 2026-11-26
- **Release:** v0.2.0 (once released)
- **Pull request:** https://github.com/akkiverse/distill/pull/9
- **Issue:** #8 (US-7)

## Why
The founder chose a hosted Postgres database (Neon) over the home data server, so that sync is always on and usage can be checked in one place. Each signed-in person's topics and saved cards should follow them to any device.

## References
None. The request came with no files or links.

## What changes
- **What people notice:** once the founder's database is connected, topics and saved cards follow a signed-in person to every device, with no home server to keep running. Nothing else changes: the screens, the "Saved on this device, will sync later" message and the 24-hour rules stay the same.
- **Underneath:**
  - The `Store` adapter now talks to Postgres directly (`PostgresStore`, using `psycopg`), configured only by `DATABASE_URL`, which the founder connected to the Vercel project for Production. The home-server adapter (`DATA_ENDPOINT`, `DATA_GATEWAY_KEY`, PostgREST) is removed.
  - The device copy stays first and the merge rules of ADR-0003 are unchanged.
  - The one table, `distill_user_state` (one JSON document per person, the same shape as v0.1.0), is created automatically the first time it's needed.
  - Combine-and-save now happens in one database transaction with the person's row locked, so two devices syncing at the same moment can't overwrite each other.
  - Previews, tests and local runs have no `DATABASE_URL`: the app stays device-only there (or uses the memory store locally with `DISTILL_MEMORY_STORE=1`).
  - `data-server/` is marked as no longer used; it is kept for history only.
  - Sign-in stays with Studio Accounts; the founder decides who can use Distill (up to 4 people) in the hub's `/admin/users`.

## Spec impact
| Criterion | Change |
|---|---|
| US-7, AC-7.1 to AC-7.6 | Added: topics and cards kept in the account database, table created when missing, device-only without a database, "will sync later" when it can't be reached, simultaneous syncs keep both changes, v0.1.0 data reads unchanged |
| AC-6.6 | Changed: "data server" becomes "account database"; behaviour unchanged |
| Data model, API outline, Out of scope, Decisions | Changed: storage is Postgres on Neon through `DATABASE_URL` |

## Architecture impact
The data server (PostgREST, Caddy, Tailscale Funnel at home) is replaced by a direct connection from the Vercel function to Neon in Singapore, the same region as the app. See [ADR-0004](../adr/0004-account-database-on-neon.md), which supersedes the storage part of ADR-0003.

## Verification
- New `tests/api/test_us7_account.py`: one test per AC-7.x plus three supporting tests (including a database driver that fails to load). The database tests run against a throwaway local Postgres started by the test run (CI sets `DISTILL_REQUIRE_PG=1`, so they fail rather than skip if Postgres is missing). Nothing real is called.
- The two PostgREST adapter tests were removed with the adapter; every other existing test is unchanged and passing.
- Result: 41 of 41 back-end tests and 17 of 17 interface tests passing; lint and production build clean.

## Notes
- After release, the first sync creates the table in the founder's Neon database. No data moves from the home server: it was never switched on in production (the live v0.1.0 health check reported `sync_configured: false` on 26 Nov 2026), so there is nothing to copy. Each device's own copy is sent up on its first sync after sign-in.
- Connections are opened per request (Vercel functions keep nothing between calls). Use the pooled Neon address if many more people are added later.
