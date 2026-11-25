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
