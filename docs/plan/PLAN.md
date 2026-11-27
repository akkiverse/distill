# Distill: Build plan

For CR-0001 (first version), with CR-0002 (account database on Neon) at the end.

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
backend/distill/store.py     Store adapter: Postgres on Neon (live, CR-0002) and memory (tests)
src/                         React app: state.tsx, screens/, components/
data-server/                 no longer used (CR-0002); kept for history
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

## CR-0002: Keep topics and saved cards in each person's account (Neon)
- **What:** replace the home-server `PostgrestStore` with `PostgresStore` (`psycopg` 3, async) reading `DATABASE_URL`; create `distill_user_state` when missing; do the sync's read, merge and save in one transaction with the row locked; remove `DATA_ENDPOINT` and `DATA_GATEWAY_KEY`; mark `data-server/` as no longer used. Nothing in the interface changes except one tooltip that named the data server.
- **Existing users' data:** the stored shape is unchanged (one `UserState` JSON document per person, `version: 1`), and every device keeps its own copy first, so each device sends its topics and saved cards up on its first sync. The home data server never ran in production, so nothing has to be copied. AC-7.6 proves a v0.1.0 row reads unchanged.
- **Previews and tests:** `DATABASE_URL` is set for Production only, so previews stay device-only; tests use the memory store, plus a throwaway local Postgres for the database tests.
- **Risks:** Neon waking from idle (8-second connect limit; the device copy covers it); two cold starts creating the table at once (advisory lock); simultaneous syncs (row lock, AC-7.5).

## CR-0003: "AI is offline" note stays after the AI is back (bug fix)
- **Cause:** the note was derived from the cards on screen, and headline-only stories were sent as "known URLs", so they were never curated again.
- **Fix:** the device keeps an `aiOnline` signal set by the live `/api/ai/status` check (on open and every minute) and by each refresh's result; the Feed shows the note only when it is `false`. Headline-only cards are left out of `known_urls`; the curated card keeps the old card's id and `fetched_at`; both merges prefer an AI summary over a headline-only copy of the same id.
- **Existing data:** no stored shape changes; data saved by v0.2.0 loads as before (the new tests seed it).

## CR-0004: Published times and a feed that stays fresh (feature)
- **What:** Indian-time publish labels on cards and the post (`time.ts`, `WhenPublished`); feed ordered by publish time; automatic refresh while the Feed is open and visible (30-second check, 15-minute threshold, visibility and focus events, at most one automatic try per 15 minutes); a device-only list of links the AI has judged, sent as known links; `replaced_at` set by `merge_cards` when a newer card replaces one the reader had; the Feed holds new cards while the reader is scrolled down and shows a "N new" pill.
- **Existing data:** `replaced_at` is optional, so cards saved by v0.2.1 on devices and in the account database read unchanged (tested). The synced device copy keeps its shape; the seen list is a separate key, and losing it only means a story may be judged again.
- **AI load:** each automatic refresh sends only stories not judged before (at most 15, as before); while the AI is offline, headline-only cards are made without it and upgraded later.
- **Risks:** a story replaced while the reader is scrolled down stays on screen until the pill is tapped (saving it then has no effect; it is already replaced); a source's wrong publish time shows as given.

## CR-0005: Price watchlist from the shared market database (feature)
- **What:** `backend/distill/market.py` (the `MarketData` adapter: `PostgresMarket` on `MARKET_DATABASE_URL`, `FakeMarket` for tests; search, watch, prices; the label, paused and founder-only rules); three routes (`/api/market/search`, `/api/market/watch`, `/api/market/prices`); `UserState.watchlist` merged newest-wins; the React `Prices` component (folded list at the top of the Feed and a Prices tab): search and add, remove, move up and down, refresh timer by market hours (`src/markets.ts`), news cards that mention an item, the information-only note and the MetalCharts credit.
- **Existing data:** `watchlist` is optional with an empty default, so account copies and device copies saved by v0.3.0 read unchanged (tested); a device still running v0.3.0 sends no watchlist, which never wins over a stored one (its `updated_at` is empty).
- **Safety:** the market adapter only knows four table names and writes only `watch_symbols`; Zerodha (`kite`) items are filtered out on the server for anyone but the founder (Studio Accounts role admin); no new keys besides `MARKET_DATABASE_URL`.
- **Risks:** until the Market Gateway runs, the live app shows "Price source not set up yet"; the gateway fetches only in market hours, so at night and at weekends a quiet gateway shows "Markets closed, prices from the last close" (AC-9.15); exchange holidays aren't in the clock, so on a holiday a quiet gateway still says "Prices paused".

## CR-0006: Watchlist page and pinned prices strip (feature)
- **What:** in `backend/distill/market.py`: categories (`category_of`, the gateway's column first), groups, tidy and short names (`names.py`), the market calendar with a clock fallback (`calendar.py`), one-connection snapshot (prices, heartbeat, calendar), feature detection for `instruments.category` and `market_calendar` (every 10 minutes), search by group with the gold kinds kept apart, and the limit raised to 20. In `models.py` and `rules.py`: watchlist version 2 (`more`, `pinned`, `strip`) and its migration. In the React app: a shared price reader (`src/prices.tsx`), the pinned strip (`components/Strip.tsx`), the Watchlist page (`screens/Watchlist.tsx`), the Add sheet (`components/AddSheet.tsx`), the item detail (`screens/Item.tsx`), the calm-state rules and type copy (`src/watch.ts`), and the Watchlist tab in the navigation. The folded Prices panel on the Feed is removed.
- **Existing users' data:** the v0.4.0 watchlist (`keys`, `updated_at`) is upgraded on load by a versioned migration (`upgrade_watchlist` in Python, `upgradeWatchlist` in TypeScript): the first 6 items are pinned, so the Feed still shows them on top, and the strip is on every screen. `keys` keeps the first 10 items and `more` holds items 11 to 20, so v0.4.0 (which allows 10 and ignores unknown fields) can still read a v0.5.0 copy, and a rollback stays safe. A device still on v0.4.0 sends a watchlist without `more`, `pinned` and `strip`; when its change is newer, its `keys` win and the stored `more`, `pinned` and `strip` are kept. Tests load v0.4.0-shaped account and device copies.
- **Gateway versions:** works with the gateway as released (v0.1.0: no `category`, no `market_calendar`) and with E1. A calendar row that no longer fits the clock (state open after its close time, or closed after its next opening) is replaced by the clock, so a gateway that stopped before the weekend can't make Distill say "paused".
- **Safety:** the founder-only rule is unchanged and covers `MCX:GOLDM` and Sovereign Gold Bonds (both `kite`); the market adapter still writes only `watch_symbols`; `market_calendar` is read only.
- **Risks:** without the gateway's calendar, exchange holidays are unknown (a quiet gateway on an NSE holiday in market hours still shows amber); Sovereign Gold Bond and gold fund names come from Zerodha and AMFI and are only title-cased; dragging is for mouse and pen, phones use the up and down buttons.

## CR-0007: Gold search keeps the fixed gold rows (bug fix B6)
- **Cause:** the search reads 100 matching rows ordered by symbol; over 100 bond, ETF and fund rows say "gold" and sort before `XAU`, so gold spot was never read.
- **Fix:** in `market.search`, on a gold search, look up `MCX:GOLDM` and `GOLD:XAU_USD` by key (the existing `instruments()` read) and put them first, after an exact symbol match, when every typed word is in their names; the SQL and the fake list bonds after the other gold rows. The founder-only filter runs afterwards, unchanged.
- **Existing users' data:** untouched. No stored shape, route or contract changes; a rollback to v0.5.0 stays safe.

## CR-0008: A smoother look, a theme switch and AI-drawn story diagrams (feature E7)
- **What:** the "Night desk" look in `src/styles.css` (new token values under the same names, glass cards, topic colours, Sora headlines from `@fontsource/sora`); a theme module (`src/theme.ts`: apply, remember on the device, `theme-color`) and a header switch (System, Light, Dark) saved with the account settings (`theme_changed_at`, newer wins in `rules.merge_state`); an inline script in `index.html` that sets `data-theme` before React starts; the AI's `cover` and `visual` fields in `prompts.py`, checked in `backend/distill/visuals.py` (numbers must be in the text, sizes and counts limited, failed diagrams dropped); `Card.cover` and `Card.visual` in `models.py` and `types.ts`; a `Diagram` component (bars, change, trend, steps; compact and full) and a cover band on cards and the post; chips with section icons.
- **Existing users' data:** only optional fields are added. Cards without `cover` and `visual` show the topic's cover colour and the key-figure chart as before; settings without `theme_changed_at` count as older than any choice made on v0.6.0, so a device still on v0.5.1 can't flip a newer theme back; v0.5.1 ignores the new fields (Pydantic and the device copy keep unknown fields harmlessly), so a rollback stays safe. Tests seed v0.5.1-shaped cards and settings.
- **AI load:** no extra AI calls: the cover and diagram come in the same answer as the summary. The answer is a little longer (about 60 to 150 more tokens).
- **Risks:** the 9B model may pick a weak diagram or none; the checks drop bad numbers, and a story without a diagram looks as it does today with the new cover. Older cards (made before the release) have no AI theme until they are replaced.

## CR-0009: Don't show "Prices paused" because of Gold spot (bug fix B8)
- **Cause:** `priceNotices` counted gold spot (open by the clock on weekdays) as an open market, so the gateway's planned overnight quiet showed as "Prices paused".
- **Fix:** leave gold spot out of the open markets for the paused note; add gold's own price time to the calm note, or a gold-only calm note while the gateway rests.
- **Existing users' data:** untouched. Interface-only; no stored shape, route or contract changes; a rollback to v0.6.0 stays safe.
