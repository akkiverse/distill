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

## CR-0005: Price watchlist from the shared market database (feature, minor)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Issue #13 (US-9), milestone v0.4.0; branch `cr/0005-price-watchlist` from `main`; CR-0005, spec, ADR-0005, plan | all | Yes |
| 2 | `MarketData` adapter (Postgres and fake), search, watch and prices with labels, paused and founder-only rules | AC-9.1, AC-9.3 to AC-9.8, AC-9.10, AC-9.13 | Yes |
| 3 | API routes and `UserState.watchlist` with newest-wins merge and v0.3.0 compatibility | AC-9.2, AC-9.11 | Yes |
| 4 | Prices component: list, search and add, remove and reorder, folded at the top of the Feed and as a tab | AC-9.2, AC-9.4 to AC-9.7, AC-9.11, AC-9.14 | Yes |
| 5 | Refresh timer by market hours, only while on screen; news cards that mention an item | AC-9.9, AC-9.12 | Yes |
| 6 | Tests, lint, build, visual check, records, pull request, preview check | all | Yes |
| 7 | Founder note (26 Nov): "Markets closed, prices from the last close" instead of "Prices paused" when every watched market is shut; tests, records, visual check | AC-9.15 | Yes |

## CR-0006: Watchlist page and pinned prices strip (feature, minor)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Issue #15 (US-10), milestone v0.5.0; branch `cr/0006-watchlist-strip` from `main`; CR-0006, spec, plan, ADR-0006 | all | Yes |
| 2 | Market adapter: categories, tidy names, calendar with clock fallback, one-connection snapshot, feature detection, search by group, limit 20 | AC-9.2, AC-10.5, AC-10.6, AC-10.9, AC-10.10 | Yes |
| 3 | Watchlist version 2 (`more`, `pinned`, `strip`), migration, merge rules, v0.4.0 compatibility | AC-10.3, AC-10.11, AC-10.12 | Yes |
| 4 | Shared price reader, Watchlist tab and routes, pinned strip with its setting | AC-10.1, AC-10.2, AC-10.11, AC-9.9 | Yes |
| 5 | Watchlist page: groups, pin toggle, Edit mode (drag, up and down, remove), strip order, desktop table | AC-10.2, AC-10.3, AC-10.4, AC-9.11 | Yes |
| 6 | Add sheet with filter chips and gold headings; item detail | AC-10.5, AC-10.7, AC-9.12 | Yes |
| 7 | Calm states from the calendar; tests (pytest, Vitest), lint, build | AC-10.8, AC-9.6, AC-9.7, AC-9.15, all | Yes |
| 8 | Visual check at 375 px and 1280 px, light and dark; screenshots | design | Yes |
| 9 | Records, pull request, CI and preview check | all | Yes |

## Release v0.2.0
- [x] Released 2026-11-26: merge commit 52e1563, Vercel deployment dpl_CcLnpx8cRaVZxp9MoX3QXT7ofQaM.
- [ ] Tag pending: add tag v0.2.0 on 52e1563 by hand if wanted.

## Release v0.2.1
- [x] Released 2026-11-26: merge commit f5cce53, Vercel deployment dpl_F8dmKUNa6B9u1XntRQGeKj4W6Rw6.
- [ ] Tag pending: add tag v0.2.1 on f5cce53 by hand if wanted.

## Release v0.3.0
- [x] Released 2026-11-26: merge commit 026f466, Vercel deployment dpl_4GHYcugmHLMjRkCZasKHSZ4U72c6 (CR-0004, E3).
- [ ] Tag pending: add tag v0.3.0 on 026f466 by hand if wanted (milestone v0.3.0 has no open issues).

## Release v0.4.0
- [x] Released 2026-11-26: merge commit d5e3313, Vercel deployment dpl_HcBAwtaxGJeyv2FnHfZtDQgrLvEn (CR-0005, E4).
- [ ] Tag pending: add tag v0.4.0 on d5e3313, a GitHub Release and close milestone v0.4.0 from a local session.

## Release v0.5.0
- [x] Released 2026-11-26: merge commit ceb93de, Vercel deployment dpl_EijM1Q8F3F8GimmjorfkECqxyHGx (CR-0006, E5).
- [ ] Tag pending: add tag v0.5.0 on ceb93de, a GitHub Release and close milestone v0.5.0 from a local session.

## CR-0007: Gold spot and India gold rate missing from gold search (bug fix B6, patch)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Branch `cr/0007-gold-search-fixed-rows` from `main`; find the cause (100-row read cut off gold spot behind bonds, ETFs and funds) | AC-10.13 | Yes |
| 2 | Look the fixed gold rows up by key on a gold search; bonds read last (SQL and fake) | AC-10.13, AC-9.1, AC-9.8 | Yes |
| 3 | Add sheet: the India rate heading explains why it's missing | AC-10.13 | Yes |
| 4 | Tests (fake and real SQL), lint, build | AC-10.13, all | Yes |
| 5 | Records (CR-0007, spec, changelog, test report), pull request, CI and preview check | all | Yes |

## Release v0.5.1
- [x] Released 2026-11-27: merge commit 32ba99f, Vercel deployment dpl_GAbyYnuFwh5rR78DPVs4EaYx3hEX (CR-0007, B6).
- [ ] Tag pending: add tag v0.5.1 on 32ba99f, a GitHub Release and close milestone v0.5.1 (if one exists) from a local session.
