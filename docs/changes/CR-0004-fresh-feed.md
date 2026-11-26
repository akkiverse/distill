# CR-0004: Show when each story was published, and keep the feed fresh on its own

- **Status:** Released
- **Requested by:** Founder (board, new feature E3)
- **Date:** 2026-11-26
- **Release:** v0.3.0 (26 Nov 2026)
- **Pull request:** https://github.com/akkiverse/distill/pull/12
- **Issue:** closes #11 (US-8)

## Why
Cards only said "2 h ago", which doesn't tell you the exact time a price or score was published, and the Feed refreshed by itself only when opened after 3 hours. The founder wants the publish time on every card and a feed that keeps itself current while it is open, without the page jumping while reading.

## References
None. The request came with no files or links.

## What changes
- **What people notice:**
  - Every card and the post detail show when the source published the story, in Indian time, e.g. "26 Nov 2026, 9:14 AM IST", next to "2 h ago". When a source gives no time, the card says "Time not given by source".
  - Cards are ordered by publish time, newest first.
  - While the Feed is open and on screen it refreshes by itself every 15 minutes, and when you come back to the tab or app after 15 minutes or more. Nothing runs in the background, and there are no notifications. The Refresh button stays.
  - The top of the Feed says "Last updated 10:42 AM".
  - When a newer report on the same story arrives (an updated gold rate, say), it replaces the older card as before and the card shows a small "Updated 10:42 AM" label.
  - New cards arriving while you're scrolled down don't move the page: a "3 new" pill appears at the top, and tapping it (or scrolling back up) shows them.
- **Underneath:**
  - `src/time.ts`: Indian-time formatting (a fixed +5:30 shift; India has no daylight saving), the 15-minute threshold, and a 30-second check while the Feed is open.
  - The Feed screen checks visibility before every automatic refresh, listens for the page becoming visible or focused, and tries at most once per 15 minutes even if a refresh fails.
  - Stories the AI has judged on a device (kept, dropped, or since replaced) are remembered on that device for 36 hours (`distill.seen.v1`, browser storage only, at most 500 links) and sent as known links, so the 15-minute refresh doesn't send them to the AI again. Headline-only cards are still re-sent so they get summaries once the AI is back (AC-3.6).
  - `rules.merge_cards` sets `replaced_at` on the newer card when it replaces a card the reader already had; the label survives later merges and syncs.

## Spec impact
| Criterion | Change |
|---|---|
| AC-4.5 | Changed: refresh on open after 15 minutes instead of 3 hours |
| AC-8.1 | Added: publish date and time in Indian time on cards and post detail |
| AC-8.2 | Added: "Time not given by source" when there is no publish time |
| AC-8.3 | Added: newest first by publish time |
| AC-8.4 | Added: refresh every 15 minutes while open and visible, and on coming back; never in the background |
| AC-8.5 | Added: stories already judged by the AI are not sent again |
| AC-8.6 | Added: "Updated &lt;time&gt;" on a card that replaced an older report |
| AC-8.7 | Added: no page jump; "N new" pill |
| AC-8.8 | Added: "Last updated &lt;time&gt;" |
Out of scope and Decisions updated: refreshing on a timer while the Feed is open is now in scope; background refresh and push notifications stay out.

## Architecture impact
- Card gains one optional field, `replaced_at` (default empty). Cards saved by v0.2.1, on the device and in the account database, read unchanged (tested). No new routes, no database change.
- New device-only browser storage key `distill.seen.v1`; the synced copy `distill.v1` keeps its shape.
- No ADR: no new technology or structural decision.

## Verification
- New `tests/api/test_us8_fresh_feed.py` (6 tests: AC-8.5 known links, AC-8.6 replacement label in four cases, and the v0.2.1 compatibility check).
- New `src/__tests__/us8_fresh_feed.test.tsx` (12 tests: date format and Indian time, the missing-date case, order, the 15-minute timer, no refresh in the background, the tab-return refresh, already-judged links, the Updated label, no scroll jump with the "1 new" pill, at-top behaviour, "Last updated").
- Updated: the two AC-4.5 tests (15 minutes), AC-4.1 (explicit publish times), and test fixtures that had assumed the 3-hour rule.
- Result: 48 of 48 back-end tests and 33 of 33 interface tests passing (81 of 81); Ruff lint and format clean; production build passes. Visual check at 375px and 1280px, light and dark.
