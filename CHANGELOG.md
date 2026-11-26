# Changelog

All notable changes to Distill are recorded here. Each entry links to its change request, which explains why.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[0.2.1]: https://github.com/akkiverse/distill/pull/10
[0.2.0]: https://github.com/akkiverse/distill/pull/9
[0.1.0]: https://github.com/akkiverse/distill/pull/7
