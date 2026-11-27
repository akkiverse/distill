# CR-0011: Detailed story summaries in bullet points

- **Status:** In review
- **Requested by:** Founder (board notes, change E10)
- **Date:** 2026-11-27
- **Release:** (once released)
- **Pull request:** [#24](https://github.com/akkiverse/distill/pull/24)
- **Issue:** #23 (US-13), milestone v0.8.0

## Why
Today the AI sees only each story's headline and the short snippet in the feed, so summaries are too short to understand a story without opening the article. The founder asked for a detailed summary of every story, in bullet points, so a story can be understood without leaving Distill.

## References
None: the request came with no files or links.

## What changes
What the reader notices:
- **Feed cards** show the story as bullet points only, read from the real article: up to 10 points, the first 3 to 4 on the card. A right arrow (and a swipe on phones, and the arrow keys for keyboard users) moves to the next points; dots show how many slides there are.
- **Tapping a card** opens the full view: headline, source, time and every bullet point, with "Read the full article at <source>" at the bottom.
- **Saved** cards look as they do now, with a longer summary (4 to 5 sentences) from the article in place of the short one.
- While a story's points are being made, its card shows today's short summary with "Detailed points are being prepared". If the publisher's page can't be read (paywall, blocked, too slow, a Google News link), the card keeps its short summary with "Detailed summary not available for this source", and Distill doesn't try again.
- If the AI server is offline, everything works as today with the short summary.

Underneath:
- New `POST /api/feed/detail`: the server reads the article page (8-second limit, at most 4 redirects, never a private-network address), keeps only the article's paragraphs, and asks Studio AI for a 4 to 5 sentence summary and up to 10 points. Any point or summary sentence with a number the article doesn't state is dropped. The article text is never stored or sent back.
- The app makes detailed summaries in the background, one story at a time (newest first), right after it opens or refreshes, and keeps them in the card (synced to the account like the rest of the card). A story is summarised once; an unusable AI answer is retried once (on a later visit), then the story keeps its short summary.
- New optional card fields: `detail_status`, `detail_summary`, `detail_points`, `detail_tries`. Cards saved by v0.7.0 don't have them and show their short summary; syncing keeps a detailed summary made on any device.

Reading of the request: the app has no separate landing page, so "Landing page: cards look as they do now, with a somewhat longer summary" is applied to the cards outside the feed (the Saved screen). The feed and full view follow the FEED section exactly.

## Spec impact
| Criterion | Change |
|---|---|
| US-13, AC-13.1 to AC-13.10 | Added |
| AC-4.1 | Unchanged for cards without detailed points; a card with them shows the points as slides instead (AC-13.6) |
| AC-5.1 | Unchanged for cards without detailed points; with them, the full view shows every point (AC-13.7) |

## Architecture impact
New `reader.py` (`ArticleReader` adapter: `HttpArticleReader`, mocked in tests) and `detail.py` (`Detailer` adapter: `StudioAIDetailer`, mocked in tests), the `/api/feed/detail` route, the card's detail fields and the merge rule that keeps them. See [ADR-0008](../adr/0008-read-articles-on-the-server-for-detailed-summaries.md).

## Verification
- Python: 35 new tests in `tests/api/test_us13_detailed_summaries.py` (article text extraction, the live reader over a mock transport, unreadable pages, redirects, private addresses, Google News links, the number rule, at most 10 points, AI offline / not set up / error, merge and sync keep the detail, v0.7.0 cards and state load unchanged). `test_ac_11_7_what_v0_6_0_saves_stays_readable_by_v0_5_1` now also allows the four new optional fields.
- Interface: 16 new tests in `src/__tests__/us13_detail.test.tsx` (slides of 3 to 4, arrows, swipe, arrow keys, tap to open, every point in the full view, background one at a time, not asked again, the two notes, AI offline, merge, v0.7.0 cards).
- Full suites: 199 of 199 Python tests and 109 of 109 interface tests passing; Ruff clean; production build passes. Visual check at 375 px and 1280 px, light and dark (see the test report).

## Notes
- Some publishers refuse servers or put the story behind a paywall; those stories keep their short summary, as asked.
- Reading the page and writing the summary takes the AI server a little longer than today's short summary; it runs in the background, one story at a time, so the feed itself is never slower.
