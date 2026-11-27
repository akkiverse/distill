# CR-0007: Gold spot and India gold rate missing from gold search

- **Status:** Released
- **Requested by:** Founder (board, bug fix B6)
- **Date:** 2026-11-26
- **Release:** v0.5.1 (2026-11-27)
- **Pull request:** https://github.com/akkiverse/distill/pull/17
- **Issue:** refs #15 (US-10: Watchlist page and pinned prices strip)

## Why
Searching "gold" in the Add sheet (or choosing the Gold chip) should list all five kinds of gold (AC-10.5), but on the live app the "International gold" heading showed "None in the price service yet", and so did "Gold rate, India". The search reads at most 100 matching rows from the shared market database, ordered by symbol. The real gateway holds well over 100 rows that also say gold (Sovereign Gold Bond series, gold ETFs and gold fund plans), and all of them sort before gold spot's symbol `XAU`, so gold spot never made it into the 100 rows that were read. The 20-result spread from CR-0006 could only share out the rows it was given.

The India gold rate (`MCX:GOLDM`) has a second, separate cause outside Distill: the Market Gateway only fills it from the founder's Zerodha connection, which needs gateway v0.2.0 running on the laptop and the day's Zerodha sign-in. Until then the row isn't in the database at all. As before (AC-9.8), it is shown to the founder's account only.

## References
None. The request came with no files or links (the board note: "gold spot hidden by too many SGB and ETF matches in the gold search; India gold rate waits for gateway v0.2.0 on the laptop and a Zerodha login").

## What changes
- **What people notice:** searching "gold" (or choosing Gold) now always shows gold spot under "International gold", and the India gold rate under "Gold rate, India" whenever the gateway has it. When the India rate isn't there yet, its heading says why ("This rate comes from the studio's Zerodha connection, so it shows on the founder's account once that's signed in for the day") instead of a bare "None".
- **Underneath:**
  - On a gold search, the gateway's two fixed gold rows (`MCX:GOLDM`, `GOLD:XAU_USD`) are looked up by key and put first (after an exact symbol match), so no number of other matches can push them out. They join only when every word typed is in their names: "gold" and "gold rate" yes, "goldbees" or "sgb" no.
  - The rows read for a gold search list Sovereign Gold Bonds after the other gold rows (same rule in the SQL and the fake market), so ETFs and funds aren't crowded out by bond series either.
  - The founder-only rule (AC-9.8) is applied after the lookup, so other people still never see Zerodha prices.

## Spec impact
| Criterion | Change |
|---|---|
| AC-10.13 | Added: a gold search always includes the India gold rate (founder only) and gold spot when the gateway has them, however many other rows match; bonds are read last; a missing India rate is explained |

## Architecture impact
None. No new routes, no change to stored data (watchlists saved by v0.5.0 and v0.4.0 load exactly as before) and no change to the market contract: the lookup uses the existing read of `market.instruments` by key. Distill still only reads the market tables and writes only `market.watch_symbols`.

## Verification
- New `tests/api/test_cr0007_gold_search.py`: 7 tests against a crowd of 210 gold rows (120 bond series, 60 fund plans, 30 ETFs), including one against the real SQL on a throwaway Postgres shaped like gateway v0.1.0. Four of them fail on v0.5.0 and pass now.
- New Vitest "AC-10.13" in `src/__tests__/us10_watchlist.test.tsx` (the India rate heading explains itself; fails on v0.5.0).
- Changed `test_us9_watchlist.py::test_ac_9_1_search_by_symbol_or_name`: on "gold", gold spot now comes before Gold BeES (the Add sheet groups by kind, so nothing on screen moves).
- Result: 129 of 129 back-end tests and 73 of 73 interface tests passing (202 of 202); Ruff lint and format clean; production build passes.
