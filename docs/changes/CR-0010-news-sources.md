# CR-0010: News sources: master list in admin, on/off per person in Settings

- **Status:** In review
- **Requested by:** Founder (board change E9)
- **Date:** 2026-11-27
- **Release:** pending (new feature, minor version: v0.7.0)
- **Pull request:** https://github.com/akkiverse/distill/pull/22
- **Board change:** E9 · News sources: master list in admin, on/off per person in Settings (new feature)
- **Issue:** [#21](https://github.com/akkiverse/distill/issues/21) (US-12)

## Why
Distill's news sources were fixed in the code (`feeds.py`), so adding, fixing or dropping a feed needed a release, and everyone got the same sources. The founder wants to manage the list from an admin screen, with every new feed checked before it is used, and each person to choose which sources feed their own Distill.

## References
None. E9 came with the founder's note only.

## What changes
- **Admin: News sources** (`#/admin/sources`, Distill admin role only; added to the hub's Apps menu at release). Starts with today's sources: every publisher feed with its sections, Google News, GDELT, and The Guardian, NewsData, Currents and Marketaux ("Needs a key" while unset). Each source shows its address, sections, On or Paused, and its last check (OK with how many stories, or failing since when and why). Check all now (also automatic when the last full check is over 12 hours old). Add a source: name, feed address, sections; the server checks it at once (8 seconds) and saves it only if it is a real RSS or Atom feed with stories, otherwise it says why in plain words. Edit (a new address is checked the same way), Pause and Resume, Remove with a confirmation. Google News and GDELT can be paused but not removed.
- **Settings → Sources** (`#/settings`, the gear in the header; also linked from Topics). Every signed-in person sees the active sources grouped by section and "Your keywords", each with a switch, all on by default. The choice is saved to their account and follows them to every device; only their own feed changes. A section whose every source is off shows a warning. Signed-out visitors and the demo use every active source.
- **Must keep working:** feeds are built from exactly the same sources as v0.6.1 until someone changes a setting (tested); topics, saved cards and watchlists are untouched; if the list can't be read, the built-in list is used.
- **Small fix found during the visual check:** on wide screens the page could be scrolled sideways into empty space (the header's background band, since v0.6.0). `html { overflow-x: clip }` stops that; nothing else moves.

## Spec impact
| Criterion | Change |
|---|---|
| US-12, AC-12.1 to AC-12.10 | Added |
| Screens, API outline, data model, stack | Settings → Sources and News sources screens; `/api/sources` and `/api/admin/sources*`; `settings.sources_off` and `sources_changed_at`; the news source list |

## Architecture impact
New module `backend/distill/catalog.py` (the list, its storage, the feed check), `sources.default_sources()` now builds from the list, new routes in `app.py`, a new table `distill_settings` in the Neon database ([ADR-0007](../adr/0007-news-source-list-in-the-account-database.md)). New screens `Settings.tsx` and `AdminSources.tsx`, a small `me.ts` sign-in helper. No new service, key or dependency.

## Keeping existing data working
Stored person data only gains two optional settings fields; copies saved by v0.6.1 read unchanged (tested) and v0.6.1 ignores the new fields, so a rollback is safe. The new table is separate and ignored by v0.6.1.

## Verification
- Python: `tests/api/test_us12_news_sources.py` (20 tests, AC-12.1 to AC-12.10; feed checks against mocked answers: a real RSS feed, an HTML page, an empty feed, 403, 500, a timeout, an unreachable host; the list stored in a throwaway local Postgres).
- UI: `src/__tests__/us12_sources.test.tsx` (9 tests: Settings switches and their save, the refresh request, signed-out view, the empty-section warning, admin-only screen, list details, add refused then accepted, pause, remove with confirmation, automatic check).
- Full suite: 257 of 257 passing (164 pytest, 93 Vitest); `npm run build`, Ruff lint and format clean. Visual check at 375 px and 1280 px, light and dark.

## Notes
- At release, add `admin_links: [{"label": "News sources", "url": "https://distill-akkiverse.vercel.app/#/admin/sources"}]` to `registry/distill.json`.
- Previews have no account database, so admin changes there last only until the preview's server restarts (the screen says so).
