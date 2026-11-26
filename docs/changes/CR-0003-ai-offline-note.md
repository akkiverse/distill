# CR-0003: "AI is offline" note stays after the AI is back

- **Status:** Released
- **Requested by:** Founder (board notes, bug fix)
- **Date:** 2026-11-26
- **Release:** v0.2.1 (26 Nov 2026)
- **Pull request:** https://github.com/akkiverse/distill/pull/10
- **Issue:** refs #3 (US-3: AI curation)

## Why
The Feed showed "AI is offline right now" whenever every card on screen had been made while the AI was off (`Feed.tsx`: `feed.every(c => c.ai_status === "offline")`), even when `/api/ai/status` said the AI was online. And because those headline-only stories were sent to the server as "already known", a later refresh never brought their AI summaries, so the note and the bare headlines stayed until the cards expired.

## References
None. The request came with no files or links.

## What changes
- **What people notice:** the "AI is offline right now" note shows only when the AI really is offline now. Once the AI is back, the next refresh turns headline-only cards into full AI summaries in place.
- **Underneath:**
  - The app checks `/api/ai/status` when it opens and every minute; the note follows the newest of that check and the latest refresh's result, never the older cards on screen.
  - A refresh no longer counts headline-only cards as known, so their stories go to the AI again. The new card keeps the same id, the person's saved choice and the first fetch time, so the 24-hour expiry is unchanged.
  - Merging (server and the device's own fallback) keeps one card per story and prefers an AI summary over a headline-only copy, so a slower device syncing an old headline copy can't undo it.
  - If the AI now judges a re-sent story not useful, the headline card simply stays until it expires, as before.

## Spec impact
| Criterion | Change |
|---|---|
| AC-3.5 | Added: the offline note follows the live status check or the latest refresh, not the cards on screen |
| AC-3.6 | Added: headline-only cards are re-curated on the next refresh and replaced by their AI summaries (id, saved choice and first fetch time kept) |

## Architecture impact
None. No new routes, no change to stored data shapes (device copy `distill.v1` and the account row are read exactly as v0.2.0 saved them). The client now calls the existing `GET /api/ai/status` (from the Studio AI kit).

## Verification
- New `src/__tests__/cr0003_ai_back.test.tsx`: two AC-3.5 tests and two AC-3.6 tests (all four fail on v0.2.0 and pass now). They load data in the v0.2.0 device format, which is the compatibility check.
- New `tests/api/test_us3_curation.py::test_ac_3_6_ai_summary_replaces_headline_only_copy` (both merge orders).
- Result: 42 of 42 back-end tests and 21 of 21 interface tests passing (63 of 63); Ruff lint and format clean; production build passes.
