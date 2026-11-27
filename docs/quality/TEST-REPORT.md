# Distill: Test report

**Run:** 2026-11-27 · **Commit:** latest on `cr/0010-news-sources` (CR-0010) · **Result:** 257 of 257 tests passing (164 pytest, 93 Vitest); every acceptance criterion covered (AC-12.1 to AC-12.10 added) · **Database tests:** against throwaway local Postgres databases started by the test run (now also the news source list) · **Build:** `npm run build` passes (JS 72 kB gzipped); Ruff lint and format clean

Previous runs: CR-0009 (2026-11-27) 228 of 228 passing; CR-0008 (2026-11-27) 225 of 225 passing; CR-0007 (2026-11-26) 202 of 202 passing; CR-0006 (2026-11-26) 194 of 194 passing; CR-0005 (2026-11-26) 132 of 132 passing; CR-0004 (2026-11-26) 81 of 81 passing; CR-0003 (2026-11-26) 63 of 63 passing; CR-0002 (2026-11-26) 58 of 58 passing; CR-0001 (2026-11-25) 51 of 51 passing.

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
| AC-4.2 | `us4_feed.test.tsx` "AC-4.2"; `us11_look.test.tsx` "AC-11.5, AC-4.2 (changed CR-0008)"; `test_us11_look_and_diagrams.py::test_ac_11_5_an_invented_number_drops_the_diagram` | Pass |
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
| AC-9.2 (changed CR-0006) | `test_us9_watchlist.py::test_ac_9_2_watchlist_kept_in_account_newer_wins`, `test_ac_9_2_twenty_first_item_is_refused` (20 allowed, 21st refused; items 11 to 20 in `more`); `us9_prices.test.tsx` "AC-9.2" | Pass |
| AC-9.3 | `test_us9_watchlist.py::test_ac_9_3_adding_or_opening_upserts_watch_symbols`, `test_ac_9_3_unknown_keys_are_not_watched`, Postgres test (first_wanted_at kept); `us9_prices.test.tsx` "AC-9.3" | Pass |
| AC-9.4 | `test_us9_watchlist.py::test_ac_9_4_price_change_and_time`; `us9_prices.test.tsx` "AC-9.4" (Rs and $ formats, green and red, "26 Nov, 2:41 PM IST") | Pass |
| AC-9.5 | `test_us9_watchlist.py::test_ac_9_5_labels` (7 cases), `test_ac_9_5_labels_reach_the_app`; `us9_prices.test.tsx` "AC-9.5" | Pass |
| AC-9.6 (changed CR-0006, CR-0009) | `test_us9_watchlist.py::test_ac_9_6_paused_after_two_minutes`; `us9_prices.test.tsx` "AC-9.6" (paused only while NSE is open); `us10_watchlist.test.tsx` "AC-10.8" ; `us10_watchlist.test.tsx` "AC-10.14" (paused kept for NSE, MCX and US) | Pass |
| AC-9.7 (changed CR-0006) | `test_us9_watchlist.py::test_ac_9_7_waiting_and_error`; `us9_prices.test.tsx` "AC-9.7" ("First price when NSE opens, Fri 9:15 AM IST" while closed, "Waiting for the first price" while open, error keeps the last price) | Pass |
| AC-9.8 | `test_us9_watchlist.py::test_ac_9_8_zerodha_prices_for_the_founder_only` (user, signed out, empty role), `test_ac_9_8_founder_sees_zerodha`, `test_ac_9_8_role_comes_from_studio_accounts`; `us9_prices.test.tsx` "AC-9.8" | Pass |
| AC-9.9 (changed CR-0006) | `us9_prices.test.tsx` "AC-9.9" (3 tests: market hours incl. US daylight saving and weekends; one read for all items, again after 30 s, none in the background; none on the Feed with the strip Off); `us10_watchlist.test.tsx` "AC-10.9", "AC-10.11" | Pass |
| AC-9.10 | `test_us9_watchlist.py::test_ac_9_10_not_set_up_and_offline`, `test_ac_9_10_unreachable_market_database`; `us9_prices.test.tsx` "AC-9.10" (2 tests) | Pass |
| AC-9.11 (changed CR-0006) | `test_us9_watchlist.py::test_ac_9_11_order_is_kept`; `us9_prices.test.tsx` "AC-9.11" (Edit mode) | Pass |
| AC-9.12 (changed CR-0006) | `us9_prices.test.tsx` "AC-9.12" (row links to the item's detail; symbol and name matches, whole words only, empty state) | Pass |
| AC-9.13 | `test_us9_watchlist.py::test_ac_9_13_market_url_is_its_own`, `test_ac_9_13_only_watch_symbols_is_written` (code scan), `test_ac_9_13_postgres_market_works_as_the_app_role` (real SQL as a role with only the contract's `app` rights; writing prices is refused) | Pass |
| AC-9.14 | `us9_prices.test.tsx` "AC-9.14" | Pass |
| AC-9.15 (changed CR-0006) | `test_us9_watchlist.py::test_ac_9_15_markets_closed_when_every_item_is_closed`, `::test_ac_9_15_one_open_market_keeps_prices_paused`; `us9_prices.test.tsx` "AC-9.15" (3: closed with the next opening, open still paused, the clock fallback) | Pass |
| AC-10.1 | `test_us10_watchlist_strip.py::test_ac_10_1_short_names_for_the_strip`; `us10_watchlist.test.tsx` "AC-10.1" (2: short name, badge, price, change, detail link, "2 more slots · Edit"; six pinned in order) | Pass |
| AC-10.2 | `test_us10_watchlist_strip.py::test_ac_10_6_and_10_2_items_carry_kind_and_group`; `us10_watchlist.test.tsx` "AC-10.2" (navigation, `#/prices` opens the Watchlist, groups with counts) | Pass |
| AC-10.3 | `test_us10_watchlist_strip.py::test_ac_10_3_pins_kept_in_the_account_newer_wins`; `us10_watchlist.test.tsx` "AC-10.3" (2: star with `aria-pressed`, 7th refused, synced; new items pinned while there is room) | Pass |
| AC-10.4 | `us10_watchlist.test.tsx` "AC-10.4" (2: within-group up and down, drag within a group, no drop across groups, remove; strip order by buttons and drag) | Pass |
| AC-10.5 | `test_us10_watchlist_strip.py::test_ac_10_5_searching_gold_lists_every_gold_type`, `::test_ac_10_5_filter_chips_and_gold_with_nothing_typed`, `::test_ac_10_5_twenty_results_keep_the_kinds_apart`; `us10_watchlist.test.tsx` "AC-10.5" (2: five headings with explanations, Added, chips send `group`) | Pass |
| AC-10.6 | `test_us10_watchlist_strip.py::test_ac_10_6_category_is_worked_out_when_the_gateway_has_none` (12 cases), `::test_ac_10_6_the_gateways_category_wins`, Postgres E1 test (category column alone marks a gold ETF); `us10_watchlist.test.tsx` "AC-10.6" (badges) | Pass |
| AC-10.7 | `us10_watchlist.test.tsx` "AC-10.7" (2: SGB detail with price, change, closed line with next opening, "What this is", source, news, note, pin and remove; item no longer in the list) | Pass |
| AC-10.8 (changed CR-0009) | `us10_watchlist.test.tsx` "AC-10.8" (2: every message and when amber shows; the strip's one-line note and Watchlist link) ; `us10_watchlist.test.tsx` "AC-10.14" (gold spot wording) | Pass |
| AC-10.9 | `test_us10_watchlist_strip.py::test_ac_10_9_clock_fallback_knows_the_next_opening`, `::test_ac_10_9_gateway_calendar_is_used_when_it_fits`, `::test_ac_10_9_a_stale_row_is_replaced_by_the_clock`, `::test_ac_10_9_works_with_the_gateway_as_released`, Postgres: `::test_ac_10_9_postgres_against_the_gateway_as_released`, `::test_ac_10_9_postgres_against_the_gateway_with_e1`; `us10_watchlist.test.tsx` "AC-10.9" | Pass |
| AC-10.10 | `test_us10_watchlist_strip.py::test_ac_10_10_tidy_names` (11 cases); `us10_watchlist.test.tsx` "AC-10.10" | Pass |
| AC-10.11 | `test_us10_watchlist_strip.py::test_ac_10_11_strip_setting_kept_in_the_account`; `us10_watchlist.test.tsx` "AC-10.11" (Every screen, Feed only, Off; synced; no reads with Off) | Pass |
| AC-10.12 | `test_us10_watchlist_strip.py::test_ac_10_12_v040_account_copy_is_upgraded`, `::test_ac_10_12_a_v040_device_cant_wipe_the_new_fields`, `::test_ac_10_12_v050_copy_stays_readable_by_v040`, `::test_ac_10_12_migration_tidies_any_copy`; `us10_watchlist.test.tsx` "AC-10.12" (2: v0.4.0 device copy upgraded and shown on the strip; items 11 to 20 kept apart, bad data tidied) | Pass |
| AC-10.13 | `test_cr0007_gold_search.py::test_ac_10_13_gold_spot_and_india_rate_survive_a_crowd_of_matches`, `::test_ac_10_13_everyone_else_still_gets_gold_spot_but_not_the_zerodha_rate`, `::test_ac_10_13_fixed_rows_only_when_the_words_fit`, `::test_ac_10_13_an_exact_symbol_match_still_leads`, `::test_ac_10_13_missing_rows_are_simply_not_there`, `::test_ac_10_13_bonds_come_after_the_other_gold_rows`, Postgres: `::test_ac_10_13_postgres_crowded_gateway`; `us10_watchlist.test.tsx` "AC-10.13" (the India rate heading explains itself) | Pass |
| AC-10.14 (added CR-0009) | `us10_watchlist.test.tsx` "AC-10.14" (3 tests: overnight with shares and gold, and gold alone, by server states and the device clock; Prices paused kept for NSE, MCX and US; the Watchlist with only gold spot) | Pass |
| AC-11.1 | `test_us11_look_and_diagrams.py::test_ac_11_1_the_choice_is_kept_in_the_account`; `us11_look.test.tsx` "AC-11.1" (switch, every screen, kept on the device and sent to the account) and "AC-11.1: a theme kept in the account is applied when the app opens" | Pass |
| AC-11.2 | `us11_look.test.tsx` "AC-11.2" (runs the start-up script from `index.html`: theme set, bar colour matches, a damaged copy ignored) | Pass |
| AC-11.3 | `test_us11_look_and_diagrams.py::test_ac_11_3_the_theme_chosen_last_wins`, `::test_ac_11_3_a_v0_5_1_device_cannot_overwrite_a_newer_choice`, `::test_ac_11_1_the_choice_is_kept_in_the_account` | Pass |
| AC-11.4 | `test_us11_look_and_diagrams.py::test_ac_11_4_cover_theme_from_the_ai`, `::test_ac_11_4_cover_theme_rules`, `::test_ac_11_4_no_cover_means_an_empty_theme`; `us11_look.test.tsx` "AC-11.4" | Pass |
| AC-11.5 | `test_us11_look_and_diagrams.py::test_ac_11_5_change_with_numbers_from_the_text`, `::test_ac_11_5_trend_and_bars_from_the_text`, `::test_ac_11_5_an_invented_number_drops_the_diagram`, `::test_ac_11_5_too_few_or_too_many_points_are_dropped`, `::test_ac_11_5_steps_rules`, `::test_ac_11_5_none_and_malformed_answers_give_no_diagram`, `::test_ac_11_5_the_prompt_asks_for_a_cover_and_a_diagram`; `us11_look.test.tsx` "AC-11.5, AC-4.2" | Pass |
| AC-11.6 | `us11_look.test.tsx` "AC-11.6: each kind draws on the card and the post" and "AC-11.6: the text version says which way a change went" | Pass |
| AC-11.7 | `test_us11_look_and_diagrams.py::test_ac_11_7_cards_and_settings_saved_by_v0_5_1_read_unchanged`, `::test_ac_11_7_what_v0_6_0_saves_stays_readable_by_v0_5_1`; `us11_look.test.tsx` "AC-11.7" | Pass |
| AC-12.1 | `test_us12_news_sources.py::test_ac_12_1_admin_only_and_starts_with_todays_sources`; `us12_sources.test.tsx` "AC-12.1: the News sources screen is for the Distill admin only" and "AC-12.1, AC-12.2" | Pass |
| AC-12.2 | `test_us12_news_sources.py::test_ac_12_2_check_all_records_ok_counts_and_failing_since`; `us12_sources.test.tsx` "AC-12.1, AC-12.2" and "AC-12.2: the screen checks every source by itself" | Pass |
| AC-12.3 | `test_us12_news_sources.py::test_ac_12_3_a_new_feed_is_checked_and_saved_only_when_it_has_stories`, `::test_ac_12_3_a_bad_feed_is_refused_with_a_plain_reason_and_not_stored` (6 cases), `::test_ac_12_3_duplicates_bad_addresses_and_missing_fields_are_refused`; `us12_sources.test.tsx` "AC-12.3" | Pass |
| AC-12.4 | `test_us12_news_sources.py::test_ac_12_4_edit_name_sections_and_a_checked_new_address` | Pass |
| AC-12.5 | `test_us12_news_sources.py::test_ac_12_5_pause_resume_and_remove`; `us12_sources.test.tsx` "AC-12.5" | Pass |
| AC-12.6 | `test_us12_news_sources.py::test_ac_12_6_each_persons_switches_are_saved_to_their_account_and_newest_wins`, `::test_ac_12_6_person_list_shows_active_sources_only`; `us12_sources.test.tsx` "AC-12.6" | Pass |
| AC-12.7 | `test_us12_news_sources.py::test_ac_12_7_a_refresh_leaves_out_the_persons_switched_off_sources`, `::test_ac_12_6_person_list_shows_active_sources_only`; `us12_sources.test.tsx` "AC-12.7" | Pass |
| AC-12.8 | `test_us12_news_sources.py::test_ac_12_8_signed_out_visitors_use_every_active_source`; `us12_sources.test.tsx` "AC-12.8" | Pass |
| AC-12.9 | `us12_sources.test.tsx` "AC-12.9" | Pass |
| AC-12.10 | `test_us12_news_sources.py::test_ac_12_10_built_in_list_asks_exactly_what_v0_6_1_asked`, `::test_ac_12_10_an_unreadable_list_falls_back_to_the_built_in_one`, `::test_ac_12_10_state_saved_by_v0_6_1_loads_unchanged`, `::test_ac_12_10_the_list_is_kept_in_the_account_database` | Pass |
| AC-9.8 with CR-0006 | `test_us10_watchlist_strip.py::test_ac_9_8_india_gold_rate_and_bonds_are_founder_only` (MCX gold rate and Sovereign Gold Bonds come from Zerodha) | Pass |
| Compatibility (CR-0006) | Account copies and device copies saved by v0.4.0 (`AC-10.12` tests above); a copy saved by v0.5.0 validates against v0.4.0's watchlist model, so a rollback stays safe | Pass |
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

## Visual check (CR-0009)
No layout or style change: the new wording uses the existing calm note (moon or clock icon) on the Watchlist and the one-line strip note, checked by the Vitest screen test "AC-10.14" (the Watchlist with only gold spot). No new screenshots were needed.

## Feed check
Checked from the Vercel preview (Singapore) with `/api/feeds/check` on 2026-11-25: **74 of 76** feeds answered with stories (all 12 Google News section feeds among them). Business Standard (latest) and Yahoo Finance answered with HTTP errors and are listed in `feeds.DROPPED`, so they are not asked; every section still has working feeds.

## Visual check (CR-0002)
No screen changed; the only interface edit is the "Not synced yet" tooltip text. The 17 interface tests and the production build pass unchanged.

## Visual check (CR-0004)
Built UI served locally with the API mocked in the browser, sample cards seeded on the device (one replaced report, one with no publish time), screenshots in headless Chromium of the Feed and a post at 375px and 1280px in light and dark. No sideways scroll at either width (page width equals viewport). The publish time and time ago sit on their own line under the source and topic; the "Updated" tag uses the soft teal chip; "Time not given by source" reads clearly. No fixes needed.

## Visual check (CR-0005)
The built interface was served locally with the API answered by fixed sample prices (TCS, GOLDBEES, EPAM, gold spot) and screenshotted with Chromium at 375 px and 1280 px, light and dark, on the Feed (Prices folded open at the top) and the Prices tab with one item opened to its news. No sideways scroll at either width. Prices align on the right in tabular figures; up is green and down red in both themes; the Live, Delayed and Market closed labels are distinct (teal, amber, grey); move and remove buttons are 44 px. Disabled "move up" on the first item and "move down" on the last are dimmed.

Markets-closed note (AC-9.15, founder note 26 Nov): served the same way with TCS and gold both closed on a Saturday and the gateway quiet; at 375 px and 1280 px, light and dark, the list shows a quiet grey note with a moon icon, "Markets closed, prices from the last close", above the last prices, and no amber "Prices paused". No sideways scroll. No fixes needed.

## Visual check (CR-0006)
The built interface was served locally with the API answered in the browser by sample answers that Distill's own market code produced from a fake market (sample prices; Thursday 26 Nov evening, US closed for Thanksgiving, NSE and MCX closed), and screenshotted with Chromium at 375 px and 1280 px, light and dark: the Feed with the pinned strip, the Watchlist, Edit mode, the Add sheet searching "gold", and an item's detail; plus the paused (amber) and unreachable states on the Feed. No sideways scroll on any screen. Screenshots: [docs/quality/screenshots/](screenshots/) (`cr0006-*.png`).

Fixes made after looking: the Watchlist title row now keeps Edit and Add beside the title on a phone, with the pin count under it (as in the design); on a wide screen the table columns got fixed widths so prices, changes and times stay on one line, and Edit mode hides the change and time columns so names keep their room; the "Add an item" label lost a double space; the closed-markets line no longer names gold spot when its hours only follow NSE and the US market; the MetalCharts credit on an item's detail shows only for gold spot; the sheet's backdrop is a fixed dark tint in both themes.

Round-1 designs followed, with these small departures: the Watchlist keeps the app header and navigation on a phone (the mockup shows the page alone) and hides the strip there, since the page lists the same prices; the pin star keeps one label ("Pin <name>") with `aria-pressed` for its state instead of switching between "Pin" and "Unpin"; the Add sheet's MCX result is named "Gold rate, India" like everywhere else (the mockup says "Gold Mini, MCX"); the holiday message adds the holiday's name in brackets when the gateway gives one; the table's time column shows the price time with its label underneath.

## Visual check (CR-0007)
Not repeated with screenshots: the only visible change is one line of text under the "Gold rate, India" heading in the Add sheet, in the same small grey style as the existing "None in the price service yet." note (checked at 375 px and 1280 px, light and dark, in CR-0006). Confirm on the preview by searching "gold".

## Design checklist (CR-0006)
- [x] New colours as tokens with designed dark values (`--gold`, `--gold-soft`); amber kept for real problems only
- [x] 375 px and 1280 px with no sideways scroll; the strip scrolls sideways inside itself on a phone; tap targets 44 px (strip tiles, stars, arrows, chips, Add buttons)
- [x] Labelled controls: the strip is a `nav` named "Pinned prices", the setting a named button group with `aria-pressed`, the Add sheet a modal dialog that closes with Escape or Done
- [x] Plain-English states: closed with the next opening, before the first price, holiday, paused, unreachable, not set up, item gone
- [x] Inline SVG icons (star, grip, calendar, clock, moon, pause, warning); no emoji
- [x] Motion: only the sheet's short slide-in, off with `prefers-reduced-motion`

## Visual check (CR-0008)
The built interface was served locally (`vite preview`) with the API answered in the browser (sync off, AI online) and six sample cards seeded on the device, one per case: bars, change, trend and steps diagrams, a card saved by v0.5.1 (no AI theme, key-figure chart) and a headline-only card. Screenshotted with Chromium at 375 px and 1280 px, in light and dark: the Feed (top and scrolled), a post with the steps diagram, Topics, and the Watchlist after choosing Light on a device set to dark (the choice wins and survives a reload). No sideways scroll on any screen. Screenshots: [docs/quality/screenshots/](screenshots/) (`cr0008-*.png`).

Fixes made after looking: the diagram's outer frame shared a class name with the change and steps layouts, which pushed the caption beside the numbers (renamed to `kind-*`); the post's horizontal steps had a large gap between the numbers and the text (rows now pack to the top); the frosted header now runs the full width of the window on a computer.

## Design checklist (CR-0008)
- [x] Both themes designed with the same token names (not inverted); an explicit choice overrides the device setting; the browser bar colour follows
- [x] Text pairs meet AA in both themes (ink and muted on paper, surface and the cover tints; white on the accent gradient only on large text and icons)
- [x] 375 px and 1280 px with no sideways scroll; the theme switch is 44 px per option on touch screens and shows its labels from 1000 px
- [x] Labelled controls: the switch is a `radiogroup` named "Theme" with `aria-checked`; every diagram has a text version
- [x] Inline SVG icons (sun, moon, monitor and one per section); no emoji; the references' photos, "Bullish" tag and strip trend lines left out on purpose (see CR-0008)
- [x] Motion: cards rise once, bars grow and trend lines draw once, buttons ease; all off with `prefers-reduced-motion`

## Releases
- v0.7.0 (2026-11-27): CR-0010 news sources master list in admin and on/off per person in Settings (E9), 257 of 257 tests passing, released through [PR #22](https://github.com/akkiverse/distill/pull/22).
- v0.6.1 (2026-11-27): CR-0009 gold spot no longer brings up "Prices paused" overnight (B8), 228 of 228 tests passing, released through [PR #20](https://github.com/akkiverse/distill/pull/20).
- v0.6.0 (2026-11-27): CR-0008 a smoother look, a theme switch and AI-drawn story diagrams (E7), 225 of 225 tests passing, released through [PR #19](https://github.com/akkiverse/distill/pull/19).
- v0.5.1 (2026-11-27): CR-0007 gold search always shows gold spot and the India gold rate (B6), 202 of 202 tests passing, released through [PR #17](https://github.com/akkiverse/distill/pull/17).
- v0.5.0 (2026-11-26): CR-0006 Watchlist page and pinned prices strip (E5), 194 of 194 tests passing, released through [PR #16](https://github.com/akkiverse/distill/pull/16).
- v0.4.0 (2026-11-26): CR-0005 price watchlist (E4), 132 of 132 tests passing, released through [PR #14](https://github.com/akkiverse/distill/pull/14).
- v0.3.0 (2026-11-26): CR-0004 publish times and a feed that stays fresh (E3), 81 of 81 tests passing, released through [PR #12](https://github.com/akkiverse/distill/pull/12).
- v0.2.1 (2026-11-26): CR-0003 "AI is offline" note fix, 63 of 63 tests passing, released through [PR #10](https://github.com/akkiverse/distill/pull/10).
- v0.2.0 (2026-11-26): CR-0002 topics and saved cards kept in each person's account (Neon), 58 of 58 tests passing, released through [PR #9](https://github.com/akkiverse/distill/pull/9).
- v0.1.0 (2026-11-25): CR-0001 first version (MVP), 51 of 51 tests passing, released through [PR #7](https://github.com/akkiverse/distill/pull/7).

## Visual check (CR-0010)

Built UI served locally (`vite preview`) with the API answered by Playwright, at 375 px and 1280 px, light and dark: Settings → Sources (some sources off, two section warnings) and News sources (OK, failing, paused, needs-a-key rows). Fixes made after looking: the off switch was hard to see in dark mode (track now a muted grey); wide screens could scroll sideways into empty space because the header's background band reaches past the edge (pre-existing since CR-0008), fixed with `html { overflow-x: clip }`, checked with a sideways scroll attempt (stays at 0). No sideways scroll at either width.
