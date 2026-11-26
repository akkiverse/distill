# Distill: Tasks

For CR-0001. Each task names the stories and criteria it serves.

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Bootstrap the repo from the Idea Studio template (README, brief, spec, ADRs, CR-0001) | all | Yes |
| 2 | One GitHub issue per user story (#1 to #6), milestone v0.1.0; Vercel project `distill` (no deploy before release) | all | Yes |
| 3 | API skeleton, sections, health, Studio AI and Studio Accounts kits | US-1, AC-1.1 | Yes |
| 4 | News sources: RSS, Google News, GDELT, keyed APIs, 8-second limit | US-2, AC-2.3 | Yes |
| 5 | Selection: keyword filter, duplicates, 15-story cap | AC-2.1, AC-2.2, AC-2.4 | Yes |
| 6 | Curator: Studio AI prompt and schema, checks, offline headline cards | US-3 | Yes |
| 7 | Rules and store: expiry, replacement, sync merge, PostgREST store | US-6 | Yes |
| 8 | React interface: Feed, Topics, Post, Saved, navigation, device copy and sync | US-1, US-4, US-5, US-6 | Yes |
| 9 | UI acceptance tests (Vitest + Testing Library) and CI | all | Yes |
| 10 | Data server kit for the home server, and the feed check endpoint | AC-6.5, AC-6.6, US-2 | Yes |
| 11 | Visual check at 375px and 1280px, light and dark | design | Yes |
| 12 | Records, pull request, preview check (and drop dead feeds found there) | all | Yes |

## Release v0.1.0
- [x] Released 2026-11-25: merge commit be9eb2d, Vercel deployment dpl_4i33zu3gL5MCt1QbKJqqbrmLBNar.
- [ ] Tag pending: Claude sessions cannot create Git tags or GitHub Releases; add tag v0.1.0 on be9eb2d by hand if wanted.

## CR-0002: account database on Neon

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Issue #8 (US-7) and milestone v0.2.0; branch `cr/0002-neon-sync` from `main` | all | Yes |
| 2 | `PostgresStore` with `psycopg`: table created when missing, one-transaction sync with the row locked; remove the PostgREST adapter | AC-7.1, AC-7.2, AC-7.4, AC-7.5 | Yes |
| 3 | Device-only without `DATABASE_URL`; memory store for tests and local runs | AC-7.3 | Yes |
| 4 | Tests against a throwaway local Postgres, including data saved by v0.1.0; CI requires Postgres | AC-7.1 to AC-7.6 | Yes |
| 5 | ADR-0004, spec, architecture, CR-0002, changelog, test report; mark `data-server/` as no longer used | all | Yes |
| 6 | Pull request and preview check | all | Yes |

## CR-0003: "AI is offline" note fix (bug fix, patch)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Branch `cr/0003-ai-offline-note` from `main`; CR-0003 and spec AC-3.5, AC-3.6 (refs #3) | all | Yes |
| 2 | Offline note follows the live `/api/ai/status` check or the latest refresh | AC-3.5 | Yes |
| 3 | Re-send headline-only stories on refresh; AI summary wins over headline copy in both merges, first fetch time kept | AC-3.6 | Yes |
| 4 | Tests (fail on v0.2.0, pass now), lint, build | AC-3.5, AC-3.6 | Yes |
| 5 | Records, pull request, preview check | all | Yes |

## CR-0004: Published times and a feed that stays fresh (feature, minor)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Issue #11 (US-8), milestone v0.3.0; branch `cr/0004-fresh-feed` from `main`; CR-0004 and spec | all | Yes |
| 2 | Publish date and time in Indian time on cards and post; "Time not given by source"; order by publish time | AC-8.1, AC-8.2, AC-8.3 | Yes |
| 3 | Automatic refresh every 15 minutes while open and visible, on coming back, never in the background; AC-4.5 to 15 minutes | AC-8.4, AC-4.5 | Yes |
| 4 | Remember links the AI judged on the device and send them as known | AC-8.5 | Yes |
| 5 | `replaced_at` in the merge rules and the "Updated" label | AC-8.6 | Yes |
| 6 | Hold new cards while scrolled down, "N new" pill, "Last updated" | AC-8.7, AC-8.8 | Yes |
| 7 | Tests, lint, build, visual check, records, pull request, preview check | all | Yes |

## Release v0.2.0
- [x] Released 2026-11-26: merge commit 52e1563, Vercel deployment dpl_CcLnpx8cRaVZxp9MoX3QXT7ofQaM.
- [ ] Tag pending: add tag v0.2.0 on 52e1563 by hand if wanted.

## Release v0.2.1
- [x] Released 2026-11-26: merge commit f5cce53, Vercel deployment dpl_F8dmKUNa6B9u1XntRQGeKj4W6Rw6.
- [ ] Tag pending: add tag v0.2.1 on f5cce53 by hand if wanted.
