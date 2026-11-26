# Distill: Specification

**Status:** Approved 2026-11-25 · **Source:** https://claude.ai/artifact/ARpie2DHmeZ6iPqF3HAGrf
This file is the source of truth for what the product does. Every change to it is made through a change request (see [../changes/](../changes/)).

## Overview
Distill turns a person's chosen news sections and keywords into a short, finished feed of AI summary cards, made by Studio AI (the founder's own Ollama server), that expire after 24 hours unless saved. MVP goal: the founder uses it daily for 30 days and finishes each visit at "You're up to date" in under 5 minutes.

Sign-in uses Studio Accounts (the hub's sign-in kit); AI uses the Studio AI kit (`studio_ai.py`), called only from the server. Neither is a user story here; both are required.

## Users
- **The founder:** follows finance (gold rate), cricket and tech; checks on the phone between tasks and on a laptop at a desk.
- **Invited friend:** follows one or two topics, not technical, uses only the phone.

## User stories and acceptance criteria

### US-1: Choose topics
As a reader I want to pick several sections and add keywords so that my feed matches exactly what I care about.
- **AC-1.1** Given the Topics screen, when it loads, then at least 10 sections are offered (World, India, Business, Finance, Technology, Science, Health, Sports, Entertainment, Politics, Environment, Education) and more than one can be selected at once. *(added CR-0001)*
- **AC-1.2** Given Finance and Sports selected and the keyword "gold rate" typed, when I press Save, then the topics are saved to my account and shown as chips on the Feed screen after a reload. *(added CR-0001)*
- **AC-1.3** Given no section selected, when I press Save, then nothing is saved and the message "Pick at least one section" is shown. *(added CR-0001)*

### US-2: Fetch matching news
As a reader I want news gathered from several free sources so that I don't miss stories.
- **AC-2.1** Given topics Finance + "gold rate" and a mock news source returning 10 articles of which 4 mention "gold rate" (any case) in the title or snippet, when the feed refreshes, then only those 4 are sent on for AI curation. *(added CR-0001)*
- **AC-2.2** Given two sources returning the same story (same URL, or titles with word overlap of 0.8 or more), when the feed refreshes, then it appears once. *(added CR-0001)*
- **AC-2.3** Given one source fails or times out after 8 seconds, when the feed refreshes, then articles from the other sources are still returned and the response lists the failed source by name. *(added CR-0001)*
- **AC-2.4** Given any refresh, then at most 15 articles are sent to AI per refresh. *(added CR-0001)*

### US-3: AI curation
As a reader I want my own AI to keep only useful stories and summarise them so that I read less and learn more.
- **AC-3.1** Given a mock AI that scores an article's relevance below 0.5, when the feed refreshes, then that article produces no card. *(added CR-0001)*
- **AC-3.2** Given a kept article, then its card has a summary of at most 400 characters and 2 to 4 key points. *(added CR-0001)*
- **AC-3.3** Given the AI returns key figures, then a figure is kept only if its number appears in the article's title or snippet; others are dropped. *(added CR-0001)*
- **AC-3.4** Given Studio AI is unavailable, when the feed refreshes, then headline-only cards are returned with `ai_status` "offline" and the Feed shows "AI is offline right now". *(added CR-0001)*
- **AC-3.5** Given every card on screen was made while the AI was offline, when the live AI status check (or the latest refresh) says the AI is online, then the Feed does not show "AI is offline right now"; the note appears only when the latest of those two says offline. *(added CR-0003)*
- **AC-3.6** Given headline-only cards in the feed and the AI back online, when the feed refreshes, then those stories are sent for curation again and their AI summaries replace the headline-only cards (same story id, saved choice and first fetch time kept, so the 24-hour expiry is unchanged); an AI summary also wins over a headline-only copy when devices sync. *(added CR-0003)*

### US-4: Card feed that ends
As a reader I want an Instagram-style feed that stops so that I don't keep scrolling.
- **AC-4.1** Given cards exist, then they are shown newest first, each with source name, time ago, the label "AI summary", the summary and its key points. *(added CR-0001)*
- **AC-4.2** Given a card with 2 or more key figures in the same unit, then it shows a small chart; otherwise it shows key-figure chips or key points only. *(added CR-0001)*
- **AC-4.3** Given the last card, then the line "You're up to date" appears below it and no more cards load. *(added CR-0001)*
- **AC-4.4** Given no topics saved, then the Feed shows "Choose your topics to start" with a button to Topics. *(added CR-0001)*
- **AC-4.5** Given the last refresh was 15 minutes ago or more, when the Feed opens, then a refresh starts automatically; given it was less than 15 minutes ago, then it does not. The Refresh button is always available. *(added CR-0001, changed CR-0004: was 3 hours)*

### US-5: Read a post in detail
As a reader I want to open a card so that I can see everything and reach the original article.
- **AC-5.1** Given a card, when I tap it, then the detail view shows the summary, all key points, any chart, and a "Read the full article at &lt;source&gt;" link that opens the original in a new tab with `rel="noopener noreferrer"`. *(added CR-0001)*
- **AC-5.2** Given a post id that no longer exists, when the detail view opens, then it shows "This post has expired" and a Back to feed button. *(added CR-0001)*

### US-6: Save, expire and replace
As a reader I want unsaved posts to disappear when they're old or replaced so that my feed stays current.
- **AC-6.1** Given an unsaved card fetched more than 24 hours ago, when the app loads, then it is removed. *(added CR-0001)*
- **AC-6.2** Given a saved card fetched more than 24 hours ago, when the app loads, then it stays and appears in the Saved tab. *(added CR-0001)*
- **AC-6.3** Given an unsaved card and a newer card for the same topic whose story key matches (AI `story_key` equal, or title word overlap 0.6 or more), when the feed refreshes, then the newer card replaces the older one. *(added CR-0001)*
- **AC-6.4** Given a saved card, when I unsave it, then it follows the normal 24-hour expiry from its fetch time. *(added CR-0001)*
- **AC-6.5** Given I save a card on one device, when I open Saved on another device signed in to the same account, then the card is there. *(added CR-0001)*
- **AC-6.6** Given the account database can't be reached, when I save or unsave a card, then the change is kept on the device, the app shows "Saved on this device, will sync later", and it syncs on the next request that reaches the database. *(added CR-0001, changed CR-0002: "data server" is now the account database)*

### US-7: Keep my topics and saved cards in my account *(added CR-0002)*
As a signed-in reader I want my topics and saved cards kept in my account so that they follow me to any device.
- **AC-7.1** Given the account database is set up and I'm signed in, when I change my topics or save a card on one device, then it is stored in my account and another device signed in to the same account gets it on its next sync. *(added CR-0002)*
- **AC-7.2** Given the account database has no Distill table yet, when the first sync arrives, then the table is created automatically and the sync succeeds. *(added CR-0002)*
- **AC-7.3** Given no account database is set up (previews, tests, local runs), then Distill works with everything kept on the device, and tests use a memory store. *(added CR-0002)*
- **AC-7.4** Given the account database can't be reached, when I save, change topics or open the app, then the change stays on the device, the app shows "Saved on this device, will sync later", and nothing is lost. *(added CR-0002)*
- **AC-7.5** Given two devices sync for the same person at the same moment, then both changes are kept (the combine-and-save happens in one database transaction). *(added CR-0002)*
- **AC-7.6** Given topics and cards saved in the format Distill v0.1.0 used, when they are loaded from the account database, then they read unchanged. *(added CR-0002)*

### US-8: See when each story was published, and a feed that stays fresh *(added CR-0004)*
As a reader I want to see when each story was published and have the feed refresh itself while I have it open, so that I know how current each card is without pressing Refresh.
- **AC-8.1** Given a card whose source gave a publish time, then the card and its post detail show it as a full date and time in Indian time, e.g. "26 Nov 2026, 9:14 AM IST", next to the time ago. *(added CR-0004)*
- **AC-8.2** Given a card whose source gave no publish time, then it shows "Time not given by source" instead of a guessed time. *(added CR-0004)*
- **AC-8.3** Given cards in the feed, then they are ordered newest first by publish time (a card without one is placed by when it was fetched). *(added CR-0004)*
- **AC-8.4** Given the Feed is open and visible, then it refreshes by itself every 15 minutes, and when I come back to the tab or app after 15 minutes or more; given the app is in the background, then no refresh runs. The manual Refresh button stays. *(added CR-0004)*
- **AC-8.5** Given stories the AI has already judged (kept, dropped or since replaced), when the feed refreshes, then their links are sent as known and they are not sent to the AI again; headline-only cards are still re-sent once the AI is back (AC-3.6). *(added CR-0004)*
- **AC-8.6** Given an unsaved card and a newer report on the same story (AC-6.3), when the feed refreshes, then the newer card replaces it and shows "Updated &lt;time&gt;" (Indian time). *(added CR-0004)*
- **AC-8.7** Given I'm scrolled down the Feed, when new cards arrive, then nothing on screen moves; a "N new" pill appears and tapping it (or scrolling back to the top) shows them at the top. At the top, new cards appear straight away. *(added CR-0004)*
- **AC-8.8** Given a refresh has happened, then the top of the Feed shows "Last updated &lt;time&gt;" (Indian time). *(added CR-0004)*

### US-9: Price watchlist *(added CR-0005)*
As the founder I want a short list of prices (gold, Indian and US shares) at the top of my Feed, each with the exact time of the price, so that I can check them without opening another app and never mistake an old price for a live one.
- **AC-9.1** Given instruments in the shared market database, when I search by symbol or name (for example "tcs"), then up to 20 matching items are listed (exact symbol matches first) with name, symbol and exchange. *(added CR-0005)*
- **AC-9.2** Given my watchlist, when I add an item, then it is kept with my topics in my account (synced like topics: the newer change wins); given 20 items already, then a 21st is refused with "You can watch up to 20 items". *(added CR-0005; changed CR-0006: was 10)*
- **AC-9.3** Given I add an item, or open the watchlist, then its keys are upserted into `market.watch_symbols` with `last_wanted_at` set to now, so the Market Gateway starts or keeps fetching them. *(added CR-0005)*
- **AC-9.4** Given a price, then the item shows name and symbol, the price with its currency (e.g. "Rs 4,182.50", "$185.20"), the change since the previous close as an amount and a percentage, green when up and red when down, and the time of that price from `as_of` in Indian time, e.g. "26 Nov, 2:41 PM IST". *(added CR-0005)*
- **AC-9.5** Given a price's `delay` and `market_state`, then it is labelled "Market closed, last close" when the market is closed, otherwise "Live" for a live price and "Delayed 15 min" (or the delay given) for a delayed one. *(added CR-0005)*
- **AC-9.6** Given `gateway_status.heartbeat_at` is more than 2 minutes old (or missing), and a watched market is open (AC-10.8, AC-10.9), then the list shows "Prices paused since &lt;time&gt;" and keeps showing the last prices with their times. *(added CR-0005; changed CR-0006: only while a watched market is open)*
- **AC-9.7** Given an item with no price yet, then it shows "Waiting for the first price" while its market is open, or "First price when NSE opens, Fri 9:15 AM IST" (its market and next opening) while it is closed; given a price row with an error, then the last price stays with the error in plain words. *(added CR-0005; changed CR-0006)*
- **AC-9.8** Given a person who is not the founder (Studio Accounts role other than admin, or not signed in), then items whose source is Zerodha (`kite`) are hidden from search, can't be added or watched, and their prices are never sent; the founder sees them. *(added CR-0005)*
- **AC-9.9** Given prices are on screen (the pinned strip, the Watchlist page or an item's detail; changed CR-0006), then prices are read every 30 seconds while any item's market is open (NSE and BSE 9:15 AM to 3:30 PM IST on weekdays, US 9:30 AM to 4 PM New York time on weekdays, gold spot on weekdays) and every 15 minutes otherwise, in one request for all items; given the app is in the background or no prices are on screen (for example the strip is set to Off or Feed only and another screen is open), then no reads run. *(added CR-0005; changed CR-0006)*
- **AC-9.10** Given `MARKET_DATABASE_URL` is not set (or the market database can't be reached), then Prices shows "Price source not set up yet" (or "Prices can't be reached right now") and every other part of Distill works. *(added CR-0005)*
- **AC-9.11** Given my watchlist in Edit mode, when I remove an item or move it up or down within its group, then the list keeps the new order on this device and in my account. *(added CR-0005; changed CR-0006)*
- **AC-9.12** Given I tap an item (in the strip or the Watchlist), then its detail opens and shows the latest news cards in my feed that mention its symbol or name (or "No news cards mention it right now"). *(added CR-0005; changed CR-0006: on the item's detail)*
- **AC-9.13** Given the market adapter, then Distill only reads `market.instruments`, `market.prices` and `market.gateway_status`, writes only `market.watch_symbols`, and uses `MARKET_DATABASE_URL`, never `DATABASE_URL`, for market tables. *(added CR-0005)*
- **AC-9.14** Given the Prices list, then it shows "For information only. Not investment advice. Prices may be delayed." and, when a gold spot price is shown, the MetalCharts credit link. *(added CR-0005)*
- **AC-9.15** Given the gateway is quiet (as in AC-9.6), every watched item has a last price whose `market_state` is closed, and none of their markets is open now (by the market calendar, AC-10.9, or else the market hours in AC-9.9), then the list shows "Markets closed, prices from the last close" instead of "Prices paused", and keeps the last prices with their times; if any watched market is open (or an item has no price yet), it still shows "Prices paused since &lt;time&gt;". The closed message also says when the first watched market opens (AC-10.8). *(added CR-0005, founder note 26 Nov 2026; changed CR-0006)*

### US-10: Watchlist page and pinned prices strip *(added CR-0006)*
As the founder I want the prices I care about most in a slim pinned strip on top of every screen, and a Watchlist page where I add, group, pin and order items (with the five kinds of gold told apart), so that the Feed stays calm and an old or closed-market price is never mistaken for a problem.
- **AC-10.1** Pinned strip: up to 6 pinned items in a slim strip under the header, each with a short name, price, change and a small type badge (ETF, SGB, MF, Spot, Rs/10 g, NSE, US); tapping one opens its detail. On a phone it scrolls sideways; on a wide screen the tiles wrap and a last tile says "N more slots · Edit". *(added CR-0006)*
- **AC-10.2** Watchlist page replaces the Prices tab (navigation: Feed, Watchlist, Saved, Topics; `#/prices` still opens it); items are grouped Gold, Indian shares, US shares, each with its count. *(added CR-0006)*
- **AC-10.3** Each item has a pin toggle (star, `aria-pressed`); at most 6 are pinned, a 7th is refused with "The strip holds up to 6 items. Unpin one first."; a newly added item is pinned while fewer than 6 are; pins and their order are kept with the watchlist in the account (newer change wins). *(added CR-0006)*
- **AC-10.4** Edit mode: move an item up or down within its group (buttons, or drag on a computer) and remove it; the strip order is set under "On top of every screen" with the same controls. *(added CR-0006)*
- **AC-10.5** Add sheet: search by name or symbol, filter chips All, Gold, Indian shares, US shares; searching "gold" (or choosing Gold) lists the five gold types under their own headings, each with a one-line explanation; items already in the watchlist say "Added". *(added CR-0006)*
- **AC-10.6** Gold types: an item's kind comes from the gateway's `instruments.category`; when the column is missing or empty it is worked out from the key, symbol and name (GOLD:XAU_USD spot, MCX: India gold rate, MF: gold fund, symbol ending -GB or starting SGB a gold bond, an ETF with GOLD in its name and not SILVER a gold ETF). *(added CR-0006)*
- **AC-10.7** Item detail: price, change since the previous close, the price time in IST, the plain-words label, what this type is (e.g. "Sovereign Gold Bond: 1 unit = 1 g of gold, 2.5% yearly interest"), where the price comes from, pin and remove, news cards that mention it, and "For information only. Not investment advice." *(added CR-0006)*
- **AC-10.8** Calm states: amber "Prices paused since &lt;time&gt; while NSE is open" only when a watched market is open and the gateway has been silent for over 2 minutes; otherwise "Markets closed, prices from the last close. NSE opens Fri 9:15 AM IST", or "Prices start when the market opens (NSE 9:15 AM IST)" before any price; per item "First price when NSE opens, Fri 9:15 AM IST"; a US holiday says "US market closed today for a holiday. Opens Fri 8:00 PM IST."; an unreachable source says "Prices can't be reached right now. The last prices stay until it's back." *(added CR-0006)*
- **AC-10.9** Market calendar: the gateway's `market.market_calendar` is used when the table exists and its row fits the current time; otherwise Distill's own market hours; Distill keeps working against the gateway as released (no `category`, no `market_calendar`). *(added CR-0006)*
- **AC-10.10** Tidy names: "TATA CONSULTANCY SERV LT" shows as "Tata Consultancy Services": a short-name list for common items and title case for other all-capital names, keeping ETF, NSE, SGB and similar in capitals. *(added CR-0006)*
- **AC-10.11** Strip setting: Every screen (default), Feed only, Off; kept with the watchlist in the account; prices are read only while the strip, the Watchlist or an item is on screen. *(added CR-0006)*
- **AC-10.12** Existing watchlists: a watchlist saved by v0.4.0 loads with its first 6 items pinned and the strip on every screen; a device still on v0.4.0 can't wipe pins, the setting or items 11 to 20; a copy saved by v0.5.0 stays readable by v0.4.0. *(added CR-0006)*

## Screens and flows
| Screen | Shows | Empty state | Error state |
|---|---|---|---|
| Sign-in (Studio Accounts kit) | Email and password | n/a | "Wrong email or password" |
| Feed (home) | Topic chips, Refresh button, "Last updated" time, "N new" pill while new cards wait, card list with publish times, "You're up to date" | "Choose your topics to start" + button | "AI is offline right now" banner with headline-only cards; "Couldn't reach &lt;source&gt;" note |
| Topics | Multi-select section grid, keyword input with chips, Save | No keywords is fine | "Pick at least one section" |
| Post detail | Summary, key points, chart, source link, Save toggle, Back | n/a | "This post has expired" + Back to feed |
| Saved | Saved cards, newest first, Unsave | "Nothing saved yet. Tap the bookmark on any post." | n/a |
| Pinned strip (under the header) *(added CR-0006)* | Up to 6 pinned items: short name, type badge, price, change; a calm one-line note; on wide screens "N more slots · Edit" | Hidden when nothing is pinned or the setting is Off | One-line amber "Prices paused" only while a watched market is open; "Prices can't be reached right now" |
| Watchlist (its own tab; replaces Prices) *(added CR-0005, changed CR-0006)* | Items grouped Gold, Indian shares, US shares with price, change and a star to pin; Edit mode (reorder, remove); "On top of every screen" order; "Show pinned prices" setting; the information-only note | "Add gold or a share to follow its price" + Add button | "Price source not set up yet"; "Prices paused since &lt;time&gt; while NSE is open"; "Markets closed, prices from the last close. NSE opens Fri 9:15 AM IST"; "Prices start when the market opens (NSE 9:15 AM IST)"; "US market closed today for a holiday"; "Prices can't be reached right now" |
| Add to watchlist (sheet over the Watchlist) *(added CR-0006)* | Search by name or symbol, chips All, Gold, Indian shares, US shares; results grouped, the five gold types each with a one-line explanation; Add / Added | "Search by name or symbol" | "No matches yet"; "Price source not set up yet"; "You can watch up to 20 items" |
| Item detail *(added CR-0006)* | Badge, symbol and exchange, name, price, change, the market state with the next opening, Pin on top / Remove, "What this is", price time, label, source, updates, "In your news", the information-only note | "No news cards mention it right now" | "This item isn't in your watchlist" + back to the Watchlist |

Flow: sign in → Topics (first time) → Feed → Refresh (progress shows "Fetching news", then "Summarising 3 of 12") → tap card → detail → back. Bottom navigation on phones: Feed, Watchlist, Saved, Topics (the old `#/prices` link opens the Watchlist). *(changed CR-0005, CR-0006)*

## Look and feel
- **Personality:** calm, clear, finished.
- **Feels right for:** someone on a phone in a short break who wants to be done in two minutes, and at a desk in the morning.
- **Colour mood:** quiet paper-like neutrals with one deep teal accent (#0F766E); no red alert colours except real errors.
- **Typography:** crisp sans for UI (system), editorial serif for card headlines (Source Serif).
- **Take cues from:** a single-column card rhythm, editorial headline typography, calm spacing. No ad slots, no infinite scroll, no busy colour blocks.
- **Avoid:** autoplay, red badges and counters, "trending" sections, streaks or anything that pulls you back.
- **Delight moment:** reaching the end: a gentle "You're up to date" with a small check and the time of the next refresh.

## Stack
Tier R, React + FastAPI on Vercel (Singapore, `sin1`). See [ADR-0002](../adr/0002-stack.md).
News sources sit behind a `NewsSource` adapter: GDELT DOC API, Google News and a fixed list of publisher RSS feeds need no key; The Guardian, NewsData.io, Currents and Marketaux are switched on only when their key environment variables are set. A mock source is used in tests. AI sits behind a `Curator` adapter using the Studio AI kit, with a mock for tests.

## API outline
| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Health check |
| GET | /api/sections | List of sections offered |
| GET | /api/ai/status | Whether Studio AI answers (for the offline banner) |
| POST | /api/feed/refresh | Takes topics (sections, keywords) and existing story keys; returns candidate articles (or curated cards), `ai_status` and failed sources |
| POST | /api/feed/curate | Curates one article (used to show progress card by card within the function time limit) |
| POST | /api/feed/merge | Applies the expiry and replacement rules to a set of cards (works without the account database) |
| GET | /api/market/search | Search the shared market database's instruments (Zerodha items for the founder only); optional `group` (gold, india, us); each result carries its category, group, tidy name and short name *(added CR-0005, changed CR-0006)* |
| POST | /api/market/watch | Upsert keys into `market.watch_symbols` (AC-9.3) *(added CR-0005)* |
| GET | /api/market/prices | Latest prices for up to 20 keys, with labels, category and tidy names, the gateway's paused state, and a `markets` map (state, next open, holiday note; from `market_calendar` or Distill's own clock) *(added CR-0005, changed CR-0006)* |
| GET, PUT | /api/me/state | Reads and syncs the signed-in person's topics, cards and settings with the account database |

## Data model
User data (topics, cards, saved state) lives in the account database: hosted Postgres on Neon (Singapore), connected to the Vercel project as `DATABASE_URL` (Production only), reached through a `Store` adapter (`PostgresStore`). One table, `distill_user_state`, one JSON document per person, created automatically when missing. The browser keeps a copy first, so the feed works when the database can't be reached. Previews, tests and local runs have no `DATABASE_URL` and stay device-only (a memory store in tests). The Vercel functions stay stateless. Each row carries the user id from Studio Accounts. *(changed CR-0002; see [ADR-0004](../adr/0004-account-database-on-neon.md))*

| Entity | Fields |
|---|---|
| Topics | sections (list), keywords (list), updated_at |
| Card | id, topic_section, title, source_name, source_url, published_at, fetched_at, summary, key_points (list), key_figures (list of {label, value, unit}), story_key, relevance, saved (bool), saved_changed_at, ai_status, replaced_at (optional, added CR-0004) |
| Settings | last_refreshed_at, theme |
| Watchlist *(added CR-0005, changed CR-0006)* | keys (the first 10 market keys such as `NSE:TCS`, `US:EPAM`, `GOLD:XAU_USD`, in display order), more (items 11 to 20), pinned (up to 6 keys, in strip order), strip (`every`, `feed` or `off`), version (2; absent in v0.4.0 copies, which the migration upgrades), updated_at |

Prices are not stored by Distill: they are read from the founder's shared market database (`MARKET_DATABASE_URL`, the contract's `app` role) through a `MarketData` adapter; see [ADR-0005](../adr/0005-market-data-from-shared-database.md). *(added CR-0005)*

## Non-functional requirements
- Works from 360px wide with no sideways scroll; bottom navigation on phones.
- First load under 2 seconds on 4G; a refresh of 3 topics finishes in under 60 seconds when Studio AI is up.
- Accessible: labels on every control, AA contrast, keyboard navigation, alt text for charts (a one-line text version of the figures).
- Light and dark themes following the system setting.
- Clear error messages; every card links to its source and shows the source name (attribution).
- No full article text stored or shown; only headline, snippet and the AI summary.

## Out of scope
- Push or email digests; any refresh while the app is in the background. *(changed CR-0004: refreshing on a timer while the Feed is open and visible is now in scope, AC-8.4)*
- AI-drawn diagrams beyond simple charts and key points.
- A second database or storage service for Distill's own data; everything Distill keeps stays in the one Neon database. *(changed CR-0002; CR-0005 only reads the founder's separate market database)*
- Calling Zerodha, Finnhub or MetalCharts from Distill, price charts and alerts. *(added CR-0005)*
- Paid news APIs, payments, ads, sharing, comments, multiple languages.
- Calling Ollama from the browser.

## Decisions (founder, 25 Nov 2026)
- **Database:** saved posts and topics sync across devices. *(changed CR-0002)* On 26 Nov 2026 the founder chose Neon (hosted Postgres, Singapore) over the home data server, to be able to check usage; it is connected to the Vercel project as `DATABASE_URL` for Production only. Up to 4 people, signed in with Studio Accounts. The home data server kit in `data-server/` is no longer used.
- **News keys:** the founder adds free keys in Vercel when wanted; GDELT, Google News and RSS are always on.
- **RSS defaults:** the founder's list, approved 25 Nov 2026, is in [backend/distill/feeds.py](../../backend/distill/feeds.py). Each section fetches only its own feeds, in parallel with an 8-second timeout. Dead feeds found during the build are dropped. Cards are built from the headline and snippet only.
- **Refresh:** automatic when the Feed opens and the last refresh is 15 minutes old or more, every 15 minutes while the Feed is open and visible, and on coming back after 15 minutes or more, plus a manual Refresh button. *(changed CR-0004, 26 Nov 2026)*

## Open questions
- Whether to turn Distill into a business is revisited after 30 days of use.
