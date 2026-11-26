# Distill: Test report

**Run:** 2026-11-26 · **Commit:** latest on `cr/0005-price-watchlist` (CR-0005) · **Result:** 132 of 132 tests passing (79 pytest, 53 Vitest); all 54 acceptance criteria covered · **Database tests:** against a throwaway local Postgres started by the test run · **Build:** `npm run build` passes (JS 56 kB gzipped); Ruff lint and format clean

Previous runs: CR-0004 (2026-11-26) 81 of 81 passing; CR-0003 (2026-11-26) 63 of 63 passing; CR-0002 (2026-11-26) 58 of 58 passing; CR-0001 (2026-11-25) 51 of 51 passing.

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
| AC-3.5 | `cr0003_ai_back.test.tsx` "AC-3.5" (online check hides the note over old headline-only cards; offline check shows it) | Pass |
| AC-3.6 | `test_us3_curation.py::test_ac_3_6_ai_summary_replaces_headline_only_copy`; `cr0003_ai_back.test.tsx` "AC-3.6" (refresh re-sends headline-only stories; device fallback merge) | Pass |
| AC-4.1 | `us4_feed.test.tsx` "AC-4.1" | Pass |
| AC-4.2 | `us4_feed.test.tsx` "AC-4.2" | Pass |
| AC-4.3 | `us4_feed.test.tsx` "AC-4.3" | Pass |
| AC-4.4 | `us4_feed.test.tsx` "AC-4.4" | Pass |
| AC-4.5 | `us4_feed.test.tsx` "AC-4.5" (both directions, 15 minutes; changed CR-0004) | Pass |
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
| AC-8.1 | `us8_fresh_feed.test.tsx` "AC-8.1" (format and Indian time incl. midnight and noon; card and post detail) | Pass |
| AC-8.2 | `us8_fresh_feed.test.tsx` "AC-8.2" (missing and unreadable publish time) | Pass |
| AC-8.3 | `us8_fresh_feed.test.tsx` "AC-8.3" | Pass |
| AC-8.4 | `us8_fresh_feed.test.tsx` "AC-8.4" (15-minute timer with fake clock; none in the background; refresh on coming back; none on coming back early) | Pass |
| AC-8.5 | `test_us8_fresh_feed.py::test_ac_8_5_known_links_are_not_sent_to_the_ai_again`; `us8_fresh_feed.test.tsx` "AC-8.5" (dropped story sent as known; headline-only not) | Pass |
| AC-8.6 | `test_us8_fresh_feed.py` (4 tests: replacement label, arriving together, saved card, sync from an older copy); `us8_fresh_feed.test.tsx` "AC-8.6"; compatibility: `test_ac_8_6_cards_saved_by_v0_2_1_still_read` | Pass |
| AC-8.7 | `us8_fresh_feed.test.tsx` "AC-8.7" (held while scrolled down, the replaced card stays on screen, "1 new" pill scrolls to the top; at the top cards appear at once; scrolling up releases) | Pass |
| AC-8.8 | `us8_fresh_feed.test.tsx` "AC-8.8" ("Last updated 10:42 AM", next refresh 15 minutes later) | Pass |
| AC-9.1 | `test_us9_watchlist.py::test_ac_9_1_search_by_symbol_or_name`, `test_ac_9_1_search_is_capped_at_20`, Postgres: `test_ac_9_13_postgres_market_works_as_the_app_role`; `us9_prices.test.tsx` "AC-9.1" | Pass |
| AC-9.2 | `test_us9_watchlist.py::test_ac_9_2_watchlist_kept_in_account_newer_wins`, `test_ac_9_2_eleventh_item_is_refused`; `us9_prices.test.tsx` "AC-9.2" | Pass |
| AC-9.3 | `test_us9_watchlist.py::test_ac_9_3_adding_or_opening_upserts_watch_symbols`, `test_ac_9_3_unknown_keys_are_not_watched`, Postgres test (first_wanted_at kept); `us9_prices.test.tsx` "AC-9.3" | Pass |
| AC-9.4 | `test_us9_watchlist.py::test_ac_9_4_price_change_and_time`; `us9_prices.test.tsx` "AC-9.4" (Rs and $ formats, green and red, "26 Nov, 2:41 PM IST") | Pass |
| AC-9.5 | `test_us9_watchlist.py::test_ac_9_5_labels` (7 cases), `test_ac_9_5_labels_reach_the_app`; `us9_prices.test.tsx` "AC-9.5" | Pass |
| AC-9.6 | `test_us9_watchlist.py::test_ac_9_6_paused_after_two_minutes`; `us9_prices.test.tsx` "AC-9.6" | Pass |
| AC-9.7 | `test_us9_watchlist.py::test_ac_9_7_waiting_and_error`; `us9_prices.test.tsx` "AC-9.7" | Pass |
| AC-9.8 | `test_us9_watchlist.py::test_ac_9_8_zerodha_prices_for_the_founder_only` (user, signed out, empty role), `test_ac_9_8_founder_sees_zerodha`, `test_ac_9_8_role_comes_from_studio_accounts`; `us9_prices.test.tsx` "AC-9.8" | Pass |
| AC-9.9 | `us9_prices.test.tsx` "AC-9.9" (3 tests: market hours incl. US daylight saving and weekends; one read for all items, again after 30 s, none in the background; none while folded) | Pass |
| AC-9.10 | `test_us9_watchlist.py::test_ac_9_10_not_set_up_and_offline`, `test_ac_9_10_unreachable_market_database`; `us9_prices.test.tsx` "AC-9.10" (2 tests) | Pass |
| AC-9.11 | `test_us9_watchlist.py::test_ac_9_11_order_is_kept`; `us9_prices.test.tsx` "AC-9.11" | Pass |
| AC-9.12 | `us9_prices.test.tsx` "AC-9.12" (symbol and name matches, whole words only, empty state) | Pass |
| AC-9.13 | `test_us9_watchlist.py::test_ac_9_13_market_url_is_its_own`, `test_ac_9_13_only_watch_symbols_is_written` (code scan), `test_ac_9_13_postgres_market_works_as_the_app_role` (real SQL as a role with only the contract's `app` rights; writing prices is refused) | Pass |
| AC-9.14 | `us9_prices.test.tsx` "AC-9.14" | Pass |
| AC-9.15 | `test_us9_watchlist.py::test_ac_9_15_markets_closed_when_every_item_is_closed`, `::test_ac_9_15_one_open_market_keeps_prices_paused`; `us9_prices.test.tsx` "AC-9.15" (3) | Pass |
| Compatibility (CR-0005) | `test_us9_watchlist.py::test_compat_v030_copy_loads_with_empty_watchlist` (account copy from v0.3.0; a v0.3.0 device can't wipe the list); `us9_prices.test.tsx` "CR-0005: a device copy saved by v0.3.0" | Pass |

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

## Visual check (CR-0004)
Built UI served locally with the API mocked in the browser, sample cards seeded on the device (one replaced report, one with no publish time), screenshots in headless Chromium of the Feed and a post at 375px and 1280px in light and dark. No sideways scroll at either width (page width equals viewport). The publish time and time ago sit on their own line under the source and topic; the "Updated" tag uses the soft teal chip; "Time not given by source" reads clearly. No fixes needed.

## Visual check (CR-0005)
The built interface was served locally with the API answered by fixed sample prices (TCS, GOLDBEES, EPAM, gold spot) and screenshotted with Chromium at 375 px and 1280 px, light and dark, on the Feed (Prices folded open at the top) and the Prices tab with one item opened to its news. No sideways scroll at either width. Prices align on the right in tabular figures; up is green and down red in both themes; the Live, Delayed and Market closed labels are distinct (teal, amber, grey); move and remove buttons are 44 px. Disabled "move up" on the first item and "move down" on the last are dimmed.

Markets-closed note (AC-9.15, founder note 26 Nov): served the same way with TCS and gold both closed on a Saturday and the gateway quiet; at 375 px and 1280 px, light and dark, the list shows a quiet grey note with a moon icon, "Markets closed, prices from the last close", above the last prices, and no amber "Prices paused". No sideways scroll. No fixes needed.

## Releases
- v0.3.0 (2026-11-26): CR-0004 publish times and a feed that stays fresh (E3), 81 of 81 tests passing, released through [PR #12](https://github.com/akkiverse/distill/pull/12).
- v0.2.1 (2026-11-26): CR-0003 "AI is offline" note fix, 63 of 63 tests passing, released through [PR #10](https://github.com/akkiverse/distill/pull/10).
- v0.2.0 (2026-11-26): CR-0002 topics and saved cards kept in each person's account (Neon), 58 of 58 tests passing, released through [PR #9](https://github.com/akkiverse/distill/pull/9).
- v0.1.0 (2026-11-25): CR-0001 first version (MVP), 51 of 51 tests passing, released through [PR #7](https://github.com/akkiverse/distill/pull/7).
