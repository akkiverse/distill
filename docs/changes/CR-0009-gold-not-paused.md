# CR-0009: Don't show "Prices paused" because of Gold spot

- **Status:** Released
- **Requested by:** Founder (board, bug fix B8)
- **Date:** 2026-11-27
- **Release:** v0.6.1 (2026-11-27)
- **Pull request:** https://github.com/akkiverse/distill/pull/20
- **Issue:** refs #15 (US-10: Watchlist page and pinned prices strip)

## Why
Between about 2:30 AM and 9:00 AM IST the Watchlist and the pinned strip showed the amber "Prices paused … while Gold spot is open" note. Nothing was wrong: the Market Gateway only reads prices while NSE, MCX or the US market is open, and reads gold spot at most every 4 hours, so overnight it stays quiet on purpose. Distill counted gold spot (open by the clock on every weekday) as an open market, so a quiet gateway looked like a fault.

## References
None. The request came with no files or links (the board note: "Don't count Gold spot as an open market for the "Prices paused" banner; show gold's own price time instead. Keep "Prices paused" when NSE, MCX or US is open and the gateway hasn't checked in for 2 minutes.").

## What changes
- **What people notice:** overnight, the amber "Prices paused" note no longer appears because of gold spot. With shares watched too, the calm note says "Markets closed, prices from the last close. NSE opens 9:15 AM IST, US at 8:00 PM IST. Gold spot price from 1:10 AM IST." With only gold spot watched, it says "Gold spot updates a few times a day. Price from 1:10 AM IST." "Prices paused" still shows whenever NSE, MCX or the US market is open and the gateway hasn't checked in for 2 minutes.
- **Underneath:** `priceNotices` in `src/watch.ts` leaves gold spot out of the open markets it checks for the paused note, and names gold's own price time in the calm note instead. The gold item page no longer gets an amber note overnight either (it reads the same notices).

## Spec impact
| Criterion | Change |
|---|---|
| AC-10.14 | Added: gold spot never counts as an open market for "Prices paused"; the calm note gives gold's own price time |
| AC-9.6 | Changed: "a watched market is open" means NSE, MCX or the US market |
| AC-10.8 | Changed: as AC-9.6, with the gold spot wording of AC-10.14 |

## Architecture impact
None. Interface-only change in one function. No routes, stored data or market contract change; watchlists and settings saved by v0.6.0 load as before, and a rollback to v0.6.0 stays safe.

## Verification
- New Vitest tests in `src/__tests__/us10_watchlist.test.tsx` (3): overnight with shares and gold, and with gold alone (server market states and the device clock); "Prices paused" still shown for NSE, MCX and US (and by the device clock); the Watchlist screen with only gold spot shows the calm note. All 3 fail on v0.6.0 and pass now.
- Result: 144 of 144 back-end tests and 84 of 84 interface tests passing (228 of 228); Ruff lint and format clean; type check and production build pass.
