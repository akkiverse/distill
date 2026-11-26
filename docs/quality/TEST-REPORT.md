# Distill: Test report

**Run:** 2026-11-26 · **Commit:** latest on `cr/0002-neon-sync` (CR-0002) · **Result:** 58 of 58 tests passing (41 pytest, 17 Vitest); all 29 acceptance criteria covered · **Database tests:** against a throwaway local Postgres 16 started by the test run · **Build:** `npm run build` passes (JS 54 kB gzipped); Ruff lint and format clean

Previous run (CR-0001, 2026-11-25): 51 of 51 passing.

## Traceability: acceptance criteria to tests

| Criterion | Test | Result |
|---|---|---|
| AC-1.1 | `test_us1_topics.py::test_ac_1_1_offers_at_least_ten_sections`; `us1_topics.test.tsx` "AC-1.1" | Pass |
| AC-1.2 | `test_us1_topics.py::test_ac_1_2_topics_saved_to_account_and_read_back`; `us1_topics.test.tsx` "AC-1.2" | Pass |
| AC-1.3 | `test_us1_topics.py::test_ac_1_3_refresh_without_sections_is_refused`; `us1_topics.test.tsx` "AC-1.3" | Pass |
| AC-2.1 | `test_us2_fetch.py::test_ac_2_1_only_keyword_matches_go_to_ai` | Pass |
| AC-2.2 | `test_us2_fetch.py::test_ac_2_2_same_story_from_two_sources_appears_once` | Pass |
| AC-2.3 | `test_us2_fetch.py::test_ac_2_3_failed_or_slow_source_is_named_and_others_still_return`, `test_ac_2_3_timeout_is_eight_seconds` | Pass |
| AC-2.4 | `test_us2_fetch.py::test_ac_2_4_at_most_fifteen_articles_go_to_ai` | Pass |
| AC-3.1 | `test_us3_curation.py::test_ac_3_1_low_relevance_produces_no_card` | Pass |
| AC-3.2 | `test_us3_curation.py::test_ac_3_2_summary_at_most_400_and_two_to_four_points` | Pass |
| AC-3.3 | `test_us3_curation.py::test_ac_3_3_figures_not_in_the_text_are_dropped` | Pass |
| AC-3.4 | `test_us3_curation.py::test_ac_3_4_ai_offline_gives_headline_cards`; `us4_feed.test.tsx` "AC-3.4" | Pass |
| AC-4.1 | `us4_feed.test.tsx` "AC-4.1" | Pass |
| AC-4.2 | `us4_feed.test.tsx` "AC-4.2" | Pass |
| AC-4.3 | `us4_feed.test.tsx` "AC-4.3" | Pass |
| AC-4.4 | `us4_feed.test.tsx` "AC-4.4" | Pass |
| AC-4.5 | `us4_feed.test.tsx` "AC-4.5" (both directions) | Pass |
| AC-5.1 | `us5_post.test.tsx` "AC-5.1" | Pass |
| AC-5.2 | `us5_post.test.tsx` "AC-5.2" | Pass |
| AC-6.1 | `test_us6_save_expire.py::test_ac_6_1_unsaved_card_older_than_24_hours_is_removed`; `us6_saved.test.tsx` "AC-6.1" | Pass |
| AC-6.2 | `test_us6_save_expire.py::test_ac_6_2_saved_card_older_than_24_hours_stays`; `us6_saved.test.tsx` "AC-6.2" (2) | Pass |
| AC-6.3 | `test_us6_save_expire.py::test_ac_6_3_newer_card_on_same_story_replaces_older`, `test_ac_6_3_saved_card_is_never_replaced` | Pass |
| AC-6.4 | `test_us6_save_expire.py::test_ac_6_4_unsaved_card_follows_normal_expiry`; `us6_saved.test.tsx` "AC-6.4" | Pass |
| AC-6.5 | `test_us6_save_expire.py::test_ac_6_5_saved_on_one_device_appears_on_another` | Pass |
| AC-6.6 | `test_us6_save_expire.py::test_ac_6_6_database_offline_answers_will_sync_later`; `us6_saved.test.tsx` "AC-6.6" | Pass |
| AC-7.1 | `test_us7_account.py::test_ac_7_1_topics_and_cards_follow_the_person_to_another_device` (real Postgres) | Pass |
| AC-7.2 | `test_us7_account.py::test_ac_7_2_table_is_created_when_missing` (real Postgres, fresh database) | Pass |
| AC-7.3 | `test_us7_account.py::test_ac_7_3_without_a_database_everything_stays_on_the_device` | Pass |
| AC-7.4 | `test_us7_account.py::test_ac_7_4_unreachable_database_says_will_sync_later` | Pass |
| AC-7.5 | `test_us7_account.py::test_ac_7_5_two_devices_syncing_at_once_keep_both_changes` (8 syncs at once; fails if the row lock is removed) | Pass |
| AC-7.6 | `test_us7_account.py::test_ac_7_6_rows_saved_by_v0_1_0_read_unchanged` (compatibility with v0.1.0 data) | Pass |

Supporting tests (not tied to one criterion): RSS parsing, the RSS adapter over HTTP, which sources each refresh asks, known links skipped, the Studio AI happy path and not-configured path, untrusted AI answers, sync without sign-in or set-up, the table check running once per instance, the memory store's sync contract, a database driver that fails to load (answers "will sync later"), health, AI status, error shape, the user id from the Studio session, and the feed check. External services are always mocked (news, Studio AI, the hub); the account database is a throwaway local Postgres.

## Design checklist
- [x] Colours as CSS custom properties with a designed dark theme (`prefers-color-scheme`)
- [x] 360px to 1440px with no sideways scroll (checked at 375px and 1280px); tap targets 44px or more
- [x] Semantic HTML, labelled controls, visible focus, skip link, AA contrast
- [x] `prefers-reduced-motion` respected; one entrance moment (cards rise, the end check draws)
- [x] Plain-English copy; empty, loading and error states designed (see DESIGN.md)
- [x] Favicon, title, meta description, Open Graph, theme-color, web manifest
- [x] Inline SVG icons, no emoji; footer "Part of Idea Studio by AkkiVerse"
- [x] No test counts or build details shown to users

## Visual check
Built UI served locally with the API, sample cards (marked "Sample:") seeded on the device, screenshots in headless Chromium of Feed, Post and Topics at 375px and 1280px in light and dark, plus the empty Feed. No sideways scroll at either width. Fixes made: none needed after review; bottom navigation on phones and top tabs on desktop behave as designed, the chart and figure chips render in both themes, and the end-of-feed moment sits below the last card.

## Feed check
Checked from the Vercel preview (Singapore) with `/api/feeds/check` on 2026-11-25: **74 of 76** feeds answered with stories (all 12 Google News section feeds among them). Business Standard (latest) and Yahoo Finance answered with HTTP errors and are listed in `feeds.DROPPED`, so they are not asked; every section still has working feeds.

## Visual check (CR-0002)
No screen changed; the only interface edit is the "Not synced yet" tooltip text. The 17 interface tests and the production build pass unchanged.

## Releases
- v0.1.0 (2026-11-25): CR-0001 first version (MVP), 51 of 51 tests passing, released through [PR #7](https://github.com/akkiverse/distill/pull/7).
