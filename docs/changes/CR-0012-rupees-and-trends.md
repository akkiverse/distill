# CR-0012: Prices in rupees first, dollars in brackets, with a trend graph

- **Status:** In review
- **Requested by:** Founder (board notes, change E11)
- **Date:** 2026-11-27
- **Release:** (set at release; a feature, so the next minor version)
- **Pull request:** [#26](https://github.com/akkiverse/distill/pull/26)
- **Issue:** #25 (US-14), milestone v0.9.0

## Why
The founder reads prices in rupees, so US shares and international gold in dollars are hard to compare at a glance. He also wants to see each item's direction today without opening it, a longer view on tap, the dollar rate itself as an item, and (his decision of 27 Nov 2026) the Zerodha prices available to everyone he lets into Distill, with a switch to undo that without a release. Depends on Market Gateway E4 (`FX:USDINR` and `market.price_points`), and must work before and after that release.

## References
None: the request came with no files or links.

## What changes
What people notice:
- **Rupees first.** Every price shows in rupees with Indian digit grouping ("₹1,52,217.50"). US shares and international gold show rupees first and dollars in brackets ("₹15,221.69 ($164.63)"); Indian items show rupees only. The change is in rupees too, with the same %. Hover or tap a dollar item's price to see the rate and its time ("₹/$ 92.46 at 8:30 PM IST"); the item's detail always says which rate was used. Without a rate, the dollar price shows alone with "₹ rate not available".
- **US dollar in rupees** can be found ("usd", "dollar", "rupee") and added like any other item, under a new **Currency** filter and group, shown as a daily reference rate.
- **Trend graphs.** Each Watchlist row and each pinned tile shows a small line of today's price, green when up since yesterday's close and red when down, next to an up or down arrow with the change and %. With no points yet (a new item, or a market not open yet today), only the arrow and change show. An item's detail has a bigger "Price trend" graph with **1D, 1W and 1M**, its high and low, and on 1D a dashed line at yesterday's close.
- **Zerodha prices for everyone signed in.** Indian shares, ETFs, gold bonds and "Gold rate, India" can be searched, added and seen by every signed-in person. In Settings the admin has a switch **"Share Zerodha prices with other users"** (On by default); Off brings back founder-only, within 30 seconds, with no release. Each person's watchlist and pins stay their own. Visitors who aren't signed in still never get Zerodha prices.
- Existing watchlists, pins and settings are unchanged; phone and desktop, light and dark.

Underneath:
- `market.py`: `FX:USDINR` read in the same round trip as the prices when a dollar item is shown; `price_inr`, `prev_close_inr`, `change_inr` per dollar item and `fx` per answer; `sees_kite(role, share)`; the currency search; `history()` with per-market "today", 7 and 30 days, and thinning to 160 points; `PostgresMarket.history` (read only) and the `price_points` check alongside the other optional parts.
- `names.py`: category `fx`, group `currency`, market `FX`, tidy names "US dollar in rupees" / "USD/INR".
- New `sharing.py`: the switch in `distill_settings` (key `market_sharing`), cached 30 seconds, Off if unreadable.
- New routes `GET /api/market/history` and `GET, PUT /api/admin/market-sharing`; search, watch and prices take the switch into account.
- Interface: `rupees.ts` (rupees-first rules, the rate text), `components/Trend.tsx` (price, change with arrow, small graph, big graph), `components/ShareSwitch.tsx`; `prices.tsx` reads today's history with the prices; the Currency group and chip; copy that no longer says Zerodha prices are the founder's only.

## Spec impact
| Criterion | Change |
|---|---|
| US-14, AC-14.1 to AC-14.12 | Added |
| AC-9.4 | Changed: "₹" with Indian grouping (was "Rs"), rupees first for dollar items, an arrow on the change |
| AC-9.8 | Changed: Zerodha items for every signed-in person while the admin switch is On (default); founder only while Off; never for visitors who aren't signed in |
| AC-9.13 | Changed: `market.price_points` (and `market.market_calendar`, from CR-0006) are read too; still only `watch_symbols` is written |
| AC-10.13 | Unchanged rule; its "founder" wording now follows AC-9.8 |

## Architecture impact
New `sharing.py` and two routes; `market.py` reads one more row and one more table. See [ADR-0009](../adr/0009-rupee-prices-history-and-zerodha-sharing.md). Data kept by Distill: one new row in `distill_settings`. Nothing in the person's saved state changes.

## Verification
- Python: 30 new tests in `tests/api/test_us14_rupees_trend.py` (rupee prices and the rate, gold spot, no rate / unusable rate / last rate with an error, the rate as an item and its search and filter, today's points per market time, 1W and 1M thinning, a gateway without history, history follows AC-9.8, sharing On for signed-in users and never for visitors, the admin switch and who may change it, unreadable switch means founder only, the 30-second cache, watchlists stay private, v0.8.0 data, and the real SQL on Postgres as the contract's `app` role with E4's table and row). Three AC-9.8 tests now cover the "sharing Off" case.
- Interface: 17 new tests in `src/__tests__/us14_rupees.test.tsx`; four existing tests updated for "₹" (was "Rs"), the arrow and the source wording.
- Full suites: 229 of 229 Python tests and 126 of 126 interface tests passing; Ruff clean; production build passes. Visual check at 375 px and 1280 px, light and dark (see the test report).

## Notes
- **Hub contract:** `docs/contracts/market-data.md` in the hub ("Rules for apps") still says Zerodha prices are for the founder only. It needs the same change as AC-9.8 (and the `FX:USDINR` / `price_points` additions already drafted on `contract/market-gateway-cr-0005`). Not changed here: a product build never edits the hub.
- Sharing prices from a personal Zerodha account with other people may be limited by Zerodha's or the exchanges' terms; the admin switch turns it off at once.
- Before Market Gateway E4 runs on the laptop, prices show dollars alone with "₹ rate not available" and no graphs; nothing else changes.
