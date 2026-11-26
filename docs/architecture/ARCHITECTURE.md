# Distill: Architecture

Last updated by CR-0002.

## Context

Who and what the system talks to.

```mermaid
flowchart LR
  reader([Reader on phone or laptop]) -->|HTTPS| app[Distill on Vercel]
  app -->|sign-in, tokens| hub[Idea Studio hub: Studio Accounts]
  app -->|headlines and snippets| news[(RSS feeds, Google News, GDELT, optional keyed APIs)]
  app -->|one story at a time, key| ai[Studio AI: Ollama on the founder's computer]
  app -->|topics and cards, DATABASE_URL| data[(Account database: Postgres on Neon, Singapore)]
```

## Components

```mermaid
flowchart TB
  subgraph Browser
    ui[React app: Feed, Topics, Post, Saved] --- copy[(Device copy: localStorage)]
  end
  subgraph Vercel["Vercel project distill (sin1)"]
    mw[middleware.js: Studio sign-in] --> static[Static UI from Vite]
    mw --> api[FastAPI /api]
    api --> sel[selection.py]
    api --> src[sources.py: NewsSource adapters]
    api --> cur[curator.py: Curator adapter]
    api --> rules[rules.py]
    api --> store[store.py: Store adapter]
  end
  ui -->|fetch /api/*| mw
  cur --> studio_ai[studio_ai.py kit] --> AI[(Studio AI)]
  store --> PG[(Neon Postgres: distill_user_state)]
  src --> NEWS[(News sources)]
```

| Component | Responsibility | Code |
|---|---|---|
| Interface | Screens, device copy, refresh progress, sync retries | `src/` |
| Sign-in | Studio Accounts redirect, session cookie, `/auth/me`, `/auth/logout` | `middleware.js` |
| API | Routes, errors in `{"error": {"code", "message"}}` | `backend/distill/app.py` |
| News sources | One adapter per source, all in parallel, 8-second limit, failures named | `backend/distill/sources.py`, `feeds.py` |
| Selection | Keyword filter, duplicates, 15-story cap, sections take turns | `backend/distill/selection.py` |
| Curator | Studio AI prompt with JSON schema; validates, trims and checks numbers | `backend/distill/curator.py`, `prompts.py` |
| Rules | 24-hour expiry, same-story replacement, sync merge | `backend/distill/rules.py` |
| Store | Per-person state in the account database (Postgres on Neon, `psycopg`), one transaction per sync | `backend/distill/store.py` |

## Data model
One document per person (`UserState`), kept on the device and, when the account database is set up, in `distill_user_state (user_id text primary key, state jsonb, updated_at timestamptz)`, created automatically when missing:

| Part | Fields |
|---|---|
| `topics` | sections, keywords, updated_at |
| `cards[]` | id, topic_section (a section id or `kw:<keyword>`), title, source_name, source_url, published_at, fetched_at, summary (≤ 400), key_points (2 to 4), key_figures [{label, value, unit}], story_key, relevance, saved, saved_changed_at, ai_status, replaced_at (optional; when a newer report replaced an older card, added CR-0004) |
| `settings` | last_refreshed_at, theme |

The device also keeps `distill.seen.v1` in browser storage: the links the AI has already judged on that device, with when, for 36 hours (at most 500). It is never synced and only feeds `known_urls`, so stories already judged are not sent to the AI again (CR-0004).

A single JSON row per person keeps the database to one table and makes sync one read and one upsert; the volume is tiny (tens of cards per person).

## Integrations and adapters
External services sit behind adapters so they can be mocked in tests and demos and swapped for real ones later.

| Integration | Adapter | Current mode | To go live |
|---|---|---|---|
| Publisher RSS, Google News, GDELT | `NewsSource` (`RssFeed`, `Gdelt`) | Live, no key | Nothing |
| The Guardian, NewsData.io, Currents, Marketaux | `NewsSource` (`Guardian`, `NewsData`, `Currents`, `Marketaux`) | Off until a key is set | Founder adds `GUARDIAN_API_KEY`, `NEWSDATA_API_KEY`, `CURRENTS_API_KEY`, `MARKETAUX_API_KEY` in Vercel |
| Studio AI | `Curator` (`StudioAICurator`) | Live when `AI_ENDPOINTS` and `AI_GATEWAY_KEY` are linked; otherwise headline-only cards | Link the shared AI variables to the project |
| Account database (Neon) | `Store` (`PostgresStore`; `MemoryStore` in tests) | Live in Production when `DATABASE_URL` is set; previews and local runs stay device-only | Done: the founder connected Neon to the project (Production) |
| Studio Accounts | `middleware.js`, `studio_auth.py` | Live | Founder adds Distill's live address in hub admin and turns sign-in on |

## Key flows
1. **Refresh:** the app sends its topics and known links to `POST /api/feed/refresh` → all sources at once → keyword filter, duplicates, cap → up to 15 stories. The app then calls `POST /api/feed/curate` for each ("Summarising 3 of 12"), merges the new cards with `POST /api/feed/merge`, saves the device copy and syncs.
2. **Open the app:** the device copy shows at once (expired cards dropped); then `PUT /api/me/state` sends it and takes back the combined copy. Without sync, `/api/feed/merge` applies the full rules.
3. **Save while the database can't be reached:** the change stays on the device, marked pending; the toast says "Saved on this device, will sync later"; the next request that reaches the database sends it.
4. **Sync:** `PUT /api/me/state` opens a short connection, locks the person's row, merges the stored copy with the device's (`rules.merge_states`) and saves it in the same transaction.
5. **Fresh feed (CR-0004):** while the Feed is open and the page is visible, it checks every 30 seconds whether 15 minutes have passed since the last refresh (or the last automatic try), and also checks when the page becomes visible again or gets focus; nothing runs in the background. When cards that weren't on screen arrive while the reader is more than 120 px down the page, the Feed keeps showing what was on screen and shows a "N new" pill; tapping it (or scrolling back to the top) shows the new cards.

## Quality attributes
- **Performance:** one JS bundle of about 54 kB gzipped plus two serif font files; charts are inline SVG. Each AI call is its own short request.
- **Security:** keys only on the server (Vercel variables); the database address lives only in the Vercel variable `DATABASE_URL` (Production), connections use TLS, and queries are parameterised. Outbound links use `rel="noopener noreferrer"`. AI output is validated before it is shown.
- **Privacy:** only the Studio Accounts user id, topics and cards are stored; never full articles, emails or names.
- **Accessibility:** labelled controls, visible focus, 44px targets, AA contrast in both themes, charts carry a text version as their accessible name, motion respects `prefers-reduced-motion`.
- Verified by the acceptance tests ([TEST-REPORT](../quality/TEST-REPORT.md)) and the visual check.

## Decisions
See [../adr/](../adr/). The most important so far:
- [ADR-0001](../adr/0001-spec-driven-development.md): spec-driven development.
- [ADR-0002](../adr/0002-stack.md): tier R, React + FastAPI on Vercel, inline SVG charts.
- [ADR-0003](../adr/0003-sync-through-home-data-server.md): device copy first and the sync merge rules (its storage part is superseded).
- [ADR-0004](../adr/0004-account-database-on-neon.md): the account database is hosted Postgres on Neon.
