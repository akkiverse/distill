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

### US-4: Card feed that ends
As a reader I want an Instagram-style feed that stops so that I don't keep scrolling.
- **AC-4.1** Given cards exist, then they are shown newest first, each with source name, time ago, the label "AI summary", the summary and its key points. *(added CR-0001)*
- **AC-4.2** Given a card with 2 or more key figures in the same unit, then it shows a small chart; otherwise it shows key-figure chips or key points only. *(added CR-0001)*
- **AC-4.3** Given the last card, then the line "You're up to date" appears below it and no more cards load. *(added CR-0001)*
- **AC-4.4** Given no topics saved, then the Feed shows "Choose your topics to start" with a button to Topics. *(added CR-0001)*
- **AC-4.5** Given the last refresh was more than 3 hours ago, when the Feed opens, then a refresh starts automatically; given it was 3 hours ago or less, then it does not. The Refresh button is always available. *(added CR-0001)*

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
- **AC-6.6** Given the data server is offline, when I save or unsave a card, then the change is kept on the device, the app shows "Saved on this device, will sync later", and it syncs on the next request that reaches the data server. *(added CR-0001)*

## Screens and flows
| Screen | Shows | Empty state | Error state |
|---|---|---|---|
| Sign-in (Studio Accounts kit) | Email and password | n/a | "Wrong email or password" |
| Feed (home) | Topic chips, Refresh button, last refreshed time, card list, "You're up to date" | "Choose your topics to start" + button | "AI is offline right now" banner with headline-only cards; "Couldn't reach &lt;source&gt;" note |
| Topics | Multi-select section grid, keyword input with chips, Save | No keywords is fine | "Pick at least one section" |
| Post detail | Summary, key points, chart, source link, Save toggle, Back | n/a | "This post has expired" + Back to feed |
| Saved | Saved cards, newest first, Unsave | "Nothing saved yet. Tap the bookmark on any post." | n/a |

Flow: sign in → Topics (first time) → Feed → Refresh (progress shows "Fetching news", then "Summarising 3 of 12") → tap card → detail → back. Bottom navigation on phones: Feed, Saved, Topics.

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
| POST | /api/feed/merge | Applies the expiry and replacement rules to a set of cards (works without the data server) |
| GET, PUT | /api/me/state | Reads and syncs the signed-in person's topics, cards and settings with the data server |

## Data model
User data (topics, cards, saved state) lives in Postgres on the founder's home server, reached through a `Store` adapter that calls PostgREST over HTTPS (behind a key check, the same pattern as Studio AI; settings `DATA_ENDPOINT` and `DATA_GATEWAY_KEY`). The browser keeps a copy so the feed works when the data server is off. A memory store is used in tests. The Vercel functions stay stateless. Each row carries the user id from Studio Accounts.

| Entity | Fields |
|---|---|
| Topics | sections (list), keywords (list), updated_at |
| Card | id, topic_section, title, source_name, source_url, published_at, fetched_at, summary, key_points (list), key_figures (list of {label, value, unit}), story_key, relevance, saved (bool), saved_changed_at, ai_status |
| Settings | last_refreshed_at, theme |

## Non-functional requirements
- Works from 360px wide with no sideways scroll; bottom navigation on phones.
- First load under 2 seconds on 4G; a refresh of 3 topics finishes in under 60 seconds when Studio AI is up.
- Accessible: labels on every control, AA contrast, keyboard navigation, alt text for charts (a one-line text version of the figures).
- Light and dark themes following the system setting.
- Clear error messages; every card links to its source and shows the source name (attribution).
- No full article text stored or shown; only headline, snippet and the AI summary.

## Out of scope
- Push or email digests, background refresh on a timer.
- AI-drawn diagrams beyond simple charts and key points.
- Running the database anywhere other than the founder's home server (a hosted database stays a later option).
- Paid news APIs, payments, ads, sharing, comments, multiple languages.
- Calling Ollama from the browser.

## Decisions (founder, 25 Nov 2026)
- **Database:** saved posts and topics sync across devices; Postgres runs on the founder's home server, the app stays on Vercel. The data server is its own Compose project (`distill`) on its own Docker network, publishes only Caddy on 127.0.0.1, never 5432, restarts on boot, sets memory limits, and includes a nightly `pg_dump` backup. See [data-server/README.md](../../data-server/README.md).
- **News keys:** the founder adds free keys in Vercel when wanted; GDELT, Google News and RSS are always on.
- **RSS defaults:** the founder's list, approved 25 Nov 2026, is in [backend/distill/feeds.py](../../backend/distill/feeds.py). Each section fetches only its own feeds, in parallel with an 8-second timeout. Dead feeds found during the build are dropped. Cards are built from the headline and snippet only.
- **Refresh:** automatic when the Feed opens and the last refresh is older than 3 hours, plus a manual Refresh button.

## Open questions
- Whether to turn Distill into a business is revisited after 30 days of use.
