# Distill: Build plan

For CR-0001 (first version).

## Stack
Tier R: React 18 + Vite + TypeScript interface; FastAPI (Python 3.12) under `/api` in one Vercel project in Singapore (`sin1`). Studio Accounts sign-in through `middleware.js`; Studio AI through `backend/distill/studio_ai.py`. See [ADR-0002](../adr/0002-stack.md).

## File layout
```
api/index.py                 Vercel entry (FastAPI app)
backend/distill/app.py       routes
backend/distill/feeds.py     sections and default feeds (founder's list)
backend/distill/sources.py   NewsSource adapters: RSS, Google News, GDELT, Guardian, NewsData, Currents, Marketaux
backend/distill/selection.py keyword filter, duplicates, the 15-story cap
backend/distill/curator.py   Curator adapter (Studio AI) and card checks
backend/distill/prompts.py   the AI prompt and answer schema
backend/distill/rules.py     expiry, replacement and sync merge
backend/distill/store.py     Store adapter: PostgREST (live) and memory (tests)
src/                         React app: state.tsx, screens/, components/
data-server/                 Compose project for the founder's home server
tests/api/                   pytest acceptance tests;  src/__tests__/  Vitest acceptance tests
```

## How each user story is met
| Story | Approach | Files |
|---|---|---|
| US-1 Choose topics | Section grid and keyword chips; topics kept on the device and synced to the account | `src/screens/Topics.tsx`, `src/state.tsx`, `/api/me/state` |
| US-2 Fetch matching news | All sources in parallel, 8 s each, failures named; keyword filter; URL and 0.8 word-overlap duplicates; sections take turns up to 15 | `sources.py`, `selection.py`, `/api/feed/refresh` |
| US-3 AI curation | One Studio AI call per story with a JSON schema; relevance < 0.5 dropped; summary and points trimmed; numbers checked against the text; offline gives headline cards | `curator.py`, `prompts.py`, `/api/feed/curate` |
| US-4 Card feed that ends | Newest-first cards, chart for 2+ figures in one unit, "You're up to date", auto refresh after 3 hours | `src/screens/Feed.tsx`, `src/components/` |
| US-5 Post detail | Hash route `#/post/<id>`, safe outbound link, expired state | `src/screens/Post.tsx` |
| US-6 Save, expire, replace | Device copy pruned on load; server rules for expiry, same-story replacement and sync merge (later save choice wins); pending sync retried on the next request | `rules.py`, `store.py`, `src/state.tsx`, `data-server/` |

## Risks and how they are handled
- **Function time limit (120 s):** the app curates one story per request (`/api/feed/curate`), so no request waits for all 15; each AI call has a 75-second limit.
- **AI offline:** headline-only cards, a banner, and nothing else blocked.
- **Data server off:** the browser copy is the working copy; changes are marked pending and sent with the next request that reaches the server.
- **Feeds change or die:** failures are listed per refresh; `/api/feeds/check` reports every feed so dead ones can be dropped in `feeds.py`.
- **Wrong numbers from a small model:** only numbers that appear in the headline or snippet are kept.
- **First release, so no existing data to migrate.** The device copy carries `version: 1` and is read defensively, so later changes can upgrade it.
