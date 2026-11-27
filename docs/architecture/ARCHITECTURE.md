# Distill: Architecture

Last updated by CR-0006.

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
    ui[React app: Feed, Watchlist, Item, Topics, Post, Saved, pinned strip] --- copy[(Device copy: localStorage)]
    ui --- reader[prices.tsx: one shared price reader]
  end
  subgraph Vercel["Vercel project distill (sin1)"]
    mw[middleware.js: Studio sign-in] --> static[Static UI from Vite]
    mw --> api[FastAPI /api]
    api --> sel[selection.py]
    api --> src[sources.py: NewsSource adapters]
    api --> cur[curator.py: Curator adapter]
    api --> rules[rules.py]
    api --> store[store.py: Store adapter]
    api --> mkt[market.py: MarketData adapter]
    mkt --> names[names.py: kinds and tidy names]
    mkt --> hours[hours.py: calendar and clock fallback]
  end
  ui -->|fetch /api/*| mw
  cur --> studio_ai[studio_ai.py kit] --> AI[(Studio AI)]
  store --> PG[(Neon Postgres: distill_user_state)]
  src --> NEWS[(News sources)]
  mkt -->|MARKET_DATABASE_URL, app role| MDB[(Founder's market database: schema market)]
  GW[Market Gateway on the founder's laptop] -->|writes prices| MDB
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
| Market data | Search (by group, gold kinds kept apart), watch and prices from the shared market database in one connection per read; labels, the paused rule and Zerodha prices for the founder only (CR-0005); kinds and tidy names, and the market calendar with a clock fallback, reading the gateway's optional `category` and `market_calendar` when they exist (CR-0006, [ADR-0006](../adr/0006-watchlist-v2-and-calendar-fallback.md)) | `backend/distill/market.py`, `names.py`, `hours.py` |
| Watchlist interface | Shared price reader (reads only while the strip, the Watchlist or an item is on screen), pinned strip, Watchlist page with Edit mode, Add sheet, item detail, calm-state rules and the watchlist migration (CR-0006) | `src/prices.tsx`, `src/watch.ts`, `src/markets.ts`, `src/components/Strip.tsx`, `src/components/AddSheet.tsx`, `src/screens/Watchlist.tsx`, `src/screens/Item.tsx` |

## Data model
One document per person (`UserState`), kept on the device and, when the account database is set up, in `distill_user_state (user_id text primary key, state jsonb, updated_at timestamptz)`, created automatically when missing:

| Part | Fields |
|---|---|
| `topics` | sections, keywords, updated_at |
| `cards[]` | id, topic_section (a section id or `kw:<keyword>`), title, source_name, source_url, published_at, fetched_at, summary (≤ 400), key_points (2 to 4), key_figures [{label, value, unit}], story_key, relevance, saved, saved_changed_at, ai_status, replaced_at (optional; when a newer report replaced an older card, added CR-0004) |
| `settings` | last_refreshed_at, theme |
| `watchlist` | keys (the first 10 market keys in display order), more (items 11 to 20), pinned (up to 6, strip order), strip (`every`, `feed`, `off`), version (2), updated_at; absent in copies saved before v0.4.0, read as empty (added CR-0005). Version 1 copies (v0.4.0: keys only) are upgraded on load: first 6 pinned, strip on every screen; a newer change from a v0.4.0 device keeps the stored more, pinned and strip (CR-0006) |

The device also keeps `distill.seen.v1` in browser storage: the links the AI has already judged on that device, with when, for 36 hours (at most 500). It is never synced and only feeds `known_urls`, so stories already judged are not sent to the AI again (CR-0004).

A single JSON row per person keeps the database to one table and makes sync one read and one upsert; the volume is tiny (tens of cards per person).

## Integrations and adapters
External services sit behind adapters so they can be mocked in tests and demos and swapped for real ones later.

| Integration | Adapter | Current mode | To go live |
|---|---|---|---|
| Publisher RSS, Google News, GDELT | `NewsSource` (`RssFeed`, `Gdelt`) | Live, no key | Nothing |
| The Guardian, NewsData.io, Currents, Marketaux | `NewsSource` (`Guardian`, `NewsData`, `Currents`, `Marketaux`) | Off until a key is set | Founder adds `GUARDIAN_API_KEY`, `NEWSDATA_API_KEY`, `CURRENTS_API_KEY`, `MARKETAUX_API_KEY` in Vercel |
| Publisher article pages | `ArticleReader` (`HttpArticleReader`; `MockReader` in tests) | Live, no key; unreadable pages keep the short summary *(added CR-0011)* | Nothing |
| Studio AI, detailed summaries | `Detailer` (`StudioAIDetailer`; `MockDetailer` in tests) | Live with the same shared AI variables as the curator *(added CR-0011)* | Nothing more |
| Studio AI | `Curator` (`StudioAICurator`) | Live when `AI_ENDPOINTS` and `AI_GATEWAY_KEY` are linked; otherwise headline-only cards | Link the shared AI variables to the project |
| Account database (Neon) | `Store` (`PostgresStore`; `MemoryStore` in tests) | Live in Production when `DATABASE_URL` is set; previews and local runs stay device-only | Done: the founder connected Neon to the project (Production) |
| Market prices (Market Gateway via a shared Neon database) | `MarketData` (`PostgresMarket`; `FakeMarket` in tests) | Off until `MARKET_DATABASE_URL` is set: the Watchlist says "Price source not set up yet" and the strip stays hidden. Reads the gateway's `category` and `market_calendar` (Market Gateway E1) when they exist | Founder runs the Market Gateway and adds `MARKET_DATABASE_URL` (the contract's `app` role) in Vercel, Production |
| Studio Accounts | `middleware.js`, `studio_auth.py` | Live | Founder adds Distill's live address in hub admin and turns sign-in on |

## Key flows
1. **Refresh:** the app sends its topics and known links to `POST /api/feed/refresh` → all sources at once → keyword filter, duplicates, cap → up to 15 stories. The app then calls `POST /api/feed/curate` for each ("Summarising 3 of 12"), merges the new cards with `POST /api/feed/merge`, saves the device copy and syncs.
2. **Open the app:** the device copy shows at once (expired cards dropped); then `PUT /api/me/state` sends it and takes back the combined copy. Without sync, `/api/feed/merge` applies the full rules.
3. **Save while the database can't be reached:** the change stays on the device, marked pending; the toast says "Saved on this device, will sync later"; the next request that reaches the database sends it.
4. **Sync:** `PUT /api/me/state` opens a short connection, locks the person's row, merges the stored copy with the device's (`rules.merge_states`) and saves it in the same transaction.
6. **Prices on screen (CR-0006):** the shell decides whether prices are on screen (the strip is shown by its setting, or the Watchlist or an item is open); only then does `prices.tsx` tell the gateway the keys are wanted (`POST /api/market/watch`) and read `GET /api/market/prices` for all watched items, every 30 s while a watched market is open (by the `markets` map in the answer), every 15 minutes otherwise, never while the page is hidden. The answer's `markets` come from `market.market_calendar` when its row fits the current time, otherwise from Distill's own hours; `watch.ts` turns them and the gateway's paused flag into the calm notes.
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
- [ADR-0005](../adr/0005-market-data-from-shared-database.md): prices from the founder's shared market database.
- [ADR-0006](../adr/0006-watchlist-v2-and-calendar-fallback.md): watchlist version 2 and the gateway's optional calendar and categories with Distill's own fallback.

## CR-0008: theme switch and AI story diagrams
- **Theme:** `src/theme.ts` puts the reader's choice on the page as `data-theme` (System removes it, so the `prefers-color-scheme` rules apply) and sets the `theme-color` bar colour; a 10-line inline script in `index.html` does the same from the device copy before React starts. The choice is `settings.theme` with `settings.theme_changed_at`; `rules.newer_theme` keeps the newer choice when devices sync.
- **AI cover and diagram:** the curator's single Studio AI call now also asks for `cover` and `visual` (`prompts.SCHEMA`). `backend/distill/visuals.py` checks them like the key figures (numbers must be in the headline or snippet; sizes and counts limited) and drops what fails. Cards carry optional `cover` and `visual`; the React `Cover` band and `Diagram` component (bars, change, trend, steps; compact and full) draw them in SVG with the theme's tokens.

```mermaid
flowchart LR
  A[Article: headline and snippet] --> C[curator.curate]
  C -->|one Studio AI call| AI[(Ollama on the founder's server)]
  AI -->|summary, points, figures, cover, visual| C
  C --> V[visuals.checked_cover / checked_visual]
  V -->|kept or dropped| K[Card.cover, Card.visual]
  K --> UI[Cover band + Diagram on the card and the post]
```

## CR-0010: news source list and per-person sources

```mermaid
flowchart LR
  Admin[Admin: News sources screen] -->|/api/admin/sources| API[FastAPI]
  Reader[Settings → Sources] -->|/api/sources, settings.sources_off| API
  API --> Cat[catalog.py<br/>list, feed check, 1-min cache]
  Cat --> DB[(Neon: distill_settings<br/>key news_sources)]
  Cat -.->|unreadable| Built[built-in list from feeds.py]
  API -->|refresh: entries + off| Src[sources.default_sources]
  Src --> Feeds[RSS, Google News, GDELT, keyed APIs]
```

| Part | Job | Where |
|---|---|---|
| News source list | Built-in seed, storage (memory or Postgres, one locked document), one-minute cache, fallback, feed check (8 s, RSS/Atom with a story, no private addresses) | `backend/distill/catalog.py` |
| Admin routes | List, add, edit, pause/resume, remove, check all; admin role only | `backend/distill/app.py` |
| Settings → Sources, News sources | The two new screens | `src/screens/Settings.tsx`, `src/screens/AdminSources.tsx` |

## CR-0011: detailed story summaries

```mermaid
sequenceDiagram
  participant App as React app (state.tsx)
  participant API as FastAPI /api/feed/detail
  participant Page as Publisher page
  participant AI as Studio AI
  App->>API: one summarised card at a time (url, title, source)
  API->>Page: GET (8 s, 4 redirects, no private addresses)
  Page-->>API: HTML
  API->>API: reader.py keeps the article paragraphs only
  API->>AI: detail prompt + JSON schema
  AI-->>API: summary, points
  API->>API: detail.py drops unknown numbers, max 10 points
  API-->>App: status + summary + points (never the article)
  App->>App: kept in the card, synced with the account
```

| Part | Job | Where |
|---|---|---|
| Article reader | Fetch the page safely and keep its main text, or say it's unreadable | `backend/distill/reader.py` |
| Detailed summary | Prompt, schema, checks (number rule, 10 points, 5 sentences) | `backend/distill/detail.py`, `backend/distill/prompts.py` |
| Background queue | One story at a time after open and refresh; stops while the AI is away | `src/state.tsx` (`prepareDetails`) |
| Slides and full view | Bullet-point slides, arrows, swipe, keys, dots; every point in the full view | `src/components/PointSlides.tsx`, `src/components/CardView.tsx`, `src/screens/Post.tsx` |
| Merge | A detailed summary from either copy of a card is kept (server and device) | `backend/distill/rules.py`, `src/state.tsx` (`localMerge`) |

## CR-0012: Prices in rupees first, with a trend graph (feature E11)

```mermaid
flowchart LR
  App[Watchlist, strip, item detail] -->|GET /api/market/prices| API
  App -->|GET /api/market/history 1d with the prices; 1w, 1m on demand| API
  Admin[Settings: admin switch] -->|GET, PUT /api/admin/market-sharing| API
  API -->|sees_kite: founder, or signed in while shared| SH[sharing.py]
  SH -->|distill_settings, key market_sharing| DB[(Distill's Neon database)]
  API -->|prices + FX:USDINR in one read; price_points| MDB[(Shared market database)]
```

| Part | Job | Where |
|---|---|---|
| Rupee prices | Read the `FX:USDINR` row with the prices; add rupee fields and `fx`; nothing when there is no usable rate | `backend/distill/market.py` (`in_rupees`, `usable_rate`) |
| Currency item | Category `fx`, group `currency`, market `FX`; listed on currency searches | `backend/distill/names.py`, `market.py` (`with_currency`) |
| Price history | `GET /api/market/history`; `price_points` read only when the gateway has the table; per-market "today"; thinning | `market.py` (`history`, `PostgresMarket.history`) |
| Sharing switch | Stored switch, 30-second cache, founder-only when unreadable; the one visibility rule | `backend/distill/sharing.py`, `market.py` (`sees_kite`), `app.py` |
| Interface | Rupees-first text, arrows, small and big graphs, admin switch; today's points read with the prices | `src/rupees.ts`, `src/components/Trend.tsx`, `src/components/ShareSwitch.tsx`, `src/prices.tsx` |

Integrations: the market database now also gives the `FX:USDINR` row and `price_points` (Market Gateway E4), both optional; without them Distill behaves as v0.8.0 apart from the rupee symbol and arrows. See [ADR-0009](../adr/0009-rupee-prices-history-and-zerodha-sharing.md).
