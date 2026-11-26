# CR-0005: Price watchlist from the shared market database

- **Status:** In review
- **Requested by:** Founder (board, new feature E4)
- **Date:** 2026-11-26
- **Release:** (set at release; a feature, so the next minor version, v0.4.0)
- **Pull request:** (see the PR for branch `cr/0005-price-watchlist`)
- **Issue:** closes #13 (US-9)

## Why
The founder follows gold, a few Indian shares and ETFs (TCS, GOLDBEES) and a US share (EPAM) every day, and wants their latest prices, with the exact time of each price, at the top of his Feed. Prices come from the founder's Market Gateway (a private service on his laptop that holds the market-data keys) through a shared database, so Distill itself never holds a broker or price-API key.

## References
| Reference | What it shows | Opened |
|---|---|---|
| <https://github.com/akkiverse/idea-studio/blob/main/docs/contracts/market-data.md> | The market data contract: tables `market.instruments`, `market.watch_symbols`, `market.prices`, `market.gateway_status`, the `app` role, and the display rules | Yes (hub clone, commit 716a58a) |

## What changes
What the reader notices:
- A **Prices** list at the top of the Feed (it can be folded away) and a new **Prices** tab.
- Search and add up to 10 items (Indian shares and ETFs, US shares, gold); remove them and change their order. The list is kept with your topics in your account.
- Each item shows its name and symbol, the latest price with its currency, the change since the previous close (amount and %, green or red), and the exact time of that price in Indian time, for example "Rs 4,182.50 · 26 Nov, 2:41 PM IST".
- A label on each price: "Live", "Delayed 15 min" or "Market closed, last close". If the Market Gateway has not checked in for 2 minutes: "Prices paused since <time>", with the last prices still shown. Before the first price arrives: "Waiting for the first price".
- Tapping an item shows the latest news cards that mention it.
- Prices from Zerodha are shown only to the founder (Studio Accounts role admin); other people can add only US shares and gold, and Indian items are hidden from their search.
- A small note under the list: "For information only. Not investment advice. Prices may be delayed.", and the MetalCharts credit link when gold spot is shown (its free plan requires one).

Underneath:
- A `MarketData` adapter (`backend/distill/market.py`): the live one reads the shared database through `MARKET_DATABASE_URL` (the contract's `app` role); a fake one is used in tests. Without the variable, Prices says "Price source not set up yet" and everything else works.
- New routes: `GET /api/market/search`, `POST /api/market/watch`, `GET /api/market/prices`.
- Distill reads `market.instruments`, `market.prices` and `market.gateway_status`, and writes only `market.watch_symbols` (adding an item and opening the watchlist set `last_wanted_at` so the gateway starts or keeps fetching it). It never writes `market.prices`, never uses its own `DATABASE_URL` for market tables, and never calls Zerodha, Finnhub or MetalCharts itself.
- The synced account copy gains `watchlist` (`keys`, `updated_at`). Copies saved by v0.3.0 have none and load with an empty list; a device still on v0.3.0 can't wipe the list when it syncs.
- While Prices is on screen it reads prices every 30 seconds when any item's market is open (NSE and BSE 9:15 AM to 3:30 PM IST, US 9:30 AM to 4 PM New York time, gold spot on weekdays), every 15 minutes otherwise, and never in the background.

## Spec impact
| Criterion | Change |
|---|---|
| US-9, AC-9.1 to AC-9.14 | Added |
| AC-7.6 | Unchanged; the new compatibility test also loads a v0.3.0 copy (no watchlist) |

## Architecture impact
A second, separate database connection (`MARKET_DATABASE_URL`) behind a new `MarketData` adapter; see [ADR-0005](../adr/0005-market-data-from-shared-database.md).

## Verification
- 127 of 127 tests passing (77 pytest, 50 Vitest): 46 new for US-9 across [test_us9_watchlist.py](../../tests/api/test_us9_watchlist.py) and [us9_prices.test.tsx](../../src/__tests__/us9_prices.test.tsx), and every earlier test unchanged.
- The market SQL runs against a throwaway Postgres shaped like the contract, connected as a role with only the contract's `app` rights (read all four tables, write `watch_symbols`); writing `market.prices` as that role is refused.
- Compatibility: account and device copies saved by v0.3.0 load with an empty watchlist, and a device on v0.3.0 can't wipe a saved list.
- Ruff lint and format clean; TypeScript and `npm run build` pass; visual check at 375 px and 1280 px in light and dark (see the [test report](../quality/TEST-REPORT.md)).

## Notes
- The Market Gateway (a separate idea on the board) is not built yet, so the live app shows "Price source not set up yet" until the founder runs it and adds `MARKET_DATABASE_URL` to the Vercel project.
- The Market Gateway's Product Spec proposes a contract tweak (fetch only while a market is open). This change follows the contract as it stands; if the tweak is approved, the "Prices paused" rule may need a small follow-up so a closed market shows "Market closed, last close" instead.
