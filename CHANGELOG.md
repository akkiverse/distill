# Changelog

All notable changes to Distill are recorded here. Each entry links to its change request, which explains why.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-26

### Added
- E5: a slim strip of up to 6 pinned prices under the header on every screen (or the Feed only, or off), each with a short name, a type badge, the price and the change; tap one for its detail. See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).
- E5: a Watchlist page replaces the Prices tab: items grouped Gold, Indian shares and US shares, a star to pin each, Edit mode to reorder and remove, the strip's order and the strip setting. See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).
- E5: an Add sheet with filter chips; searching "gold" lists the five kinds of gold (India gold rate, international spot, gold ETFs, Sovereign Gold Bonds, gold mutual funds), each explained in a line. See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).
- E5: an item detail page: price, change, price time in IST, label, what the item is, where the price comes from, pin and remove, and the news cards that mention it. See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).

### Changed
- E5: closed markets stay calm: "Markets closed, prices from the last close. NSE opens Fri 9:15 AM IST", "Prices start when the market opens", "First price when NSE opens", and a US holiday message; amber "Prices paused" only while a watched market is open. Uses the Market Gateway's market calendar when it has one, Distill's own market hours otherwise. See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).
- E5: up to 20 watched items (was 10); names shown tidied ("Tata Consultancy Services", not "TATA CONSULTANCY SERV LT"). Watchlists saved by v0.4.0 keep working, with their first 6 items pinned. See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).

### Removed
- E5: the folding Prices panel at the top of the Feed (replaced by the pinned strip). See [CR-0006](docs/changes/CR-0006-watchlist-strip.md).

## [0.4.0] - 2026-11-26

### Added
- A Prices watchlist at the top of the Feed (it folds away) and as its own tab: search and add up to 10 items (gold, Indian and US shares), each with its latest price, the change since the previous close and the exact time of the price in Indian time, labelled Live, Delayed or Market closed; "Prices paused" when the Market Gateway is quiet while a watched market is open, and "Markets closed, prices from the last close" when every watched market is shut; news cards that mention an item. Zerodha prices are shown to the founder only. See [CR-0005](docs/changes/CR-0005-price-watchlist.md).

## [0.3.0] - 2026-11-26

### Added
- Every card and post shows when the source published the story, in Indian time (or "Time not given by source"); cards are ordered by publish time. See [CR-0004](docs/changes/CR-0004-fresh-feed.md).
- The Feed refreshes by itself every 15 minutes while it is open and on screen, and when you come back after 15 minutes or more; "Last updated" at the top, "Updated" on a card that replaced an older report, and a "N new" pill so the page never jumps while reading. See [CR-0004](docs/changes/CR-0004-fresh-feed.md).

### Changed
- Opening the Feed refreshes it when the last refresh is 15 minutes old or more (was 3 hours). See [CR-0004](docs/changes/CR-0004-fresh-feed.md).

## [0.2.1] - 2026-11-26

### Fixed
- The "AI is offline right now" note no longer stays after the AI is back, and the next refresh replaces headline-only cards with AI summaries. See [CR-0003](docs/changes/CR-0003-ai-offline-note.md).

## [0.2.0] - 2026-11-26

### Changed
- Topics and saved cards are kept in each signed-in person's account in a hosted database (Neon), so they follow you to any device; the home data server is no longer used. See [CR-0002](docs/changes/CR-0002-neon-sync.md).

## [0.1.0] - 2026-11-25

### Added
- First version (MVP), built from the approved spec. See [CR-0001](docs/changes/CR-0001-mvp.md).

[0.5.0]: https://github.com/akkiverse/distill/pull/16
[0.4.0]: https://github.com/akkiverse/distill/pull/14
[0.3.0]: https://github.com/akkiverse/distill/pull/12
[0.2.1]: https://github.com/akkiverse/distill/pull/10
[0.2.0]: https://github.com/akkiverse/distill/pull/9
[0.1.0]: https://github.com/akkiverse/distill/pull/7
