# ADR-0007: The news source list lives in the account database, as one document

- **Status:** Accepted
- **Date:** 2026-11-27
- **Change request:** CR-0010

## Context
Board change E9 moves Distill's news sources out of the code (`feeds.py`) into a list the founder manages, and lets each person switch sources off for their own feed. The list must survive restarts and be shared by every Vercel function, while the feed must never go empty because the list can't be read. The founder wants Distill to keep a single database (the Neon account database, ADR-0004).

## Decision
- The list is one JSON document in a new small table `distill_settings` (key `news_sources`) in the same Neon database, created automatically like `distill_user_state`. Admin changes are read-modify-write inside one transaction with the row locked (as AC-7.5 does for a person's state).
- Until the founder changes anything, the list is the built-in one, made from `feeds.py` (each feed once, with all its sections), Google News, GDELT and the four keyed services; the two feeds the first build found dead start paused, with the reason. `feeds.py` stays as that seed and as the fallback.
- A refresh reads the list at most once a minute per server, and uses the built-in list if it can't be read.
- A new or changed address is checked from the server (8 seconds) before it is saved; addresses inside private networks are refused, since the server fetches them.
- Each person's switched-off sources are a list of source ids in their own `settings` (`sources_off`, with `sources_changed_at` so the newest change wins across devices). An off-list (rather than an on-list) means sources added later start on for everyone, and removed ids are simply ignored.
- Without `DATABASE_URL` (previews, local runs) the list lives in the server's memory and resets on restart; the admin screen says so.

## Consequences
- No new service, key or cost; one more row in Neon. Rolling back to v0.6.1 is safe: v0.6.1 ignores the new table and the new settings fields.
- Each refresh may read the list once a minute per warm function, a small extra database read.
- Keyed services can be removed by the founder; bringing one back would need a code change (their adapters are built in).
