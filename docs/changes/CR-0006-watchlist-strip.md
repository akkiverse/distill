# CR-0006: Watchlist page and pinned prices strip

- **Status:** In progress
- **Requested by:** Founder (board, new feature E5)
- **Date:** 2026-11-26
- **Release:** v0.5.0 (once released; feature, minor)
- **Pull request:** to follow
- **Issue:** closes #15 (US-10); changes criteria of US-9 (#13)

## Why
On most evenings and weekends v0.4.0 looks broken: the price service only writes while a market is open, so Distill shows an amber "Prices paused", TCS says "Waiting for the first price", the full Prices panel with its search box and buttons crowds the top of the Feed, and names come in Zerodha's capitals ("TATA CONSULTANCY SERV LT"). The founder also wants the five kinds of gold (international spot, India's gold rate, gold ETFs, Sovereign Gold Bonds and gold mutual funds) told apart, and one place to choose which prices stay on top of the screen. The Strategist recommended direction B, a slim pinned strip plus a Watchlist page; the Designer's round-1 designs were approved for the build.

## References
| Reference | What it shows | Opened |
|---|---|---|
| <https://claude.ai/artifact/LnTBCZxKPA7MFoXdNJrpDQ> | Strategist brief "Distill Prices 2.0": what's wrong today, the five gold types, direction B (pinned strip + Watchlist page), the E5 scope and the strip setting | Yes |
| <https://claude.ai/artifact/Lktgxu48sHFMgMpkkq3b9H> | Design canvas, round 1: Feed with pinned strip, Watchlist page, Add sheet with gold types, item detail (dark), status messages, desktop Watchlist | Yes, through the saved round-1 mockups (Main, Watchlist, AddGold, Detail, States, Desktop) |
| <https://github.com/akkiverse/idea-studio/blob/contract/market-gateway-cr-0002/docs/contracts/market-data.md> | Market data contract as extended by Market Gateway CR-0002 (E1): `instruments.category`, `MCX:GOLDM`, `MF:<scheme code>`, Sovereign Gold Bonds, the `market_calendar` table | Yes (hub branch `contract/market-gateway-cr-0002`) |
| <https://github.com/akkiverse/market-gateway/pull/12> | Market Gateway E1 (built, not released): how the gateway sets `category` (`app/categories.py`) and the calendar table | Yes |

## What changes
What the reader notices:
- **A pinned strip** under the header: up to 6 items with a short name ("TCS", "Gold India", "Gold BeES"), the price, the change and a small type badge (ETF, SGB, MF, Spot, Rs/10 g, NSE, US). Tapping one opens its detail. On a phone it scrolls sideways; on a computer the tiles wrap and the last one says "2 more slots · Edit". A one-line calm note under it says, for example, "Markets closed · NSE opens Fri 9:15 AM IST".
- **A Watchlist page** replaces the Prices tab (navigation: Feed, Watchlist, Saved, Topics). Items are grouped Gold, Indian shares, US shares; each has a star to pin it to the strip. Edit mode moves items up or down within their group (buttons, or drag on a computer) and removes them; "On top of every screen" sets the strip's order. Up to 20 items (was 10), up to 6 pinned.
- **Add an item:** a search sheet with filter chips (All, Gold, Indian shares, US shares). Searching "gold" lists the five gold types under their own headings, each with a one-line explanation.
- **Item detail:** price, change since the previous close, the price time in IST, the plain-words label, what this type of item is (for example "Sovereign Gold Bond: 1 unit = 1 g of gold, 2.5% yearly interest"), where the price comes from, pin and remove, news cards that mention it, and the information-only note.
- **Calm states:** amber only when a watched market is open and the price service has been silent for over 2 minutes. Otherwise: "Markets closed, prices from the last close. NSE opens Fri 9:15 AM IST", or "Prices start when the market opens (NSE 9:15 AM IST)" before the first price; per item "First price when NSE opens, Fri 9:15 AM IST"; "US market closed today for a holiday. Opens Fri 8:00 PM IST."; and "Prices can't be reached right now. The last prices stay until it's back."
- **Tidy names:** "TATA CONSULTANCY SERV LT" shows as "Tata Consultancy Services" (a short-name list for common items, title case for other all-capital names, with ETF, NSE, SGB and the like kept in capitals).
- **Strip setting:** Every screen (default), Feed only, Off; kept with the watchlist in your account.

Underneath:
- `market.py` reads the gateway's new `instruments.category` and `market.market_calendar` when they exist (checked once every 10 minutes through `information_schema`), and otherwise works them out itself: the category from the key, symbol and name, and the calendar from Distill's own market hours (NSE, US, MCX, gold spot). A calendar row that no longer fits the clock (for example "open" written by the last pass before the weekend) is replaced by the clock. Prices, the heartbeat and the calendar are read over one connection.
- New in the API answers: each item's `category`, `group`, `display_name`, `short_name` and `market`, and a `markets` map (state, next open and close, holiday note, and whether it came from the gateway or the clock). `GET /api/market/search` takes an optional `group` and keeps the gold kinds apart in its 20 results.
- The watchlist in the account copy gains `more` (items 11 to 20), `pinned`, `strip` and `version: 2`. `keys` keeps holding the first 10, so v0.4.0 can still read a copy saved by v0.5.0 (a rollback stays safe). A versioned migration upgrades a v0.4.0 watchlist on load (first 6 pinned, strip on every screen), on the device and in the account; a device still on v0.4.0 sends none of the new fields, and the stored ones are kept.
- Zerodha (`source = kite`) prices stay founder-only, now including the India gold rate (`MCX:GOLDM`) and Sovereign Gold Bonds.

## Spec impact
| Criterion | Change |
|---|---|
| US-10, AC-10.1 to AC-10.12 | Added |
| AC-9.2 | Changed: up to 20 items (was 10); the 21st is refused with "You can watch up to 20 items" |
| AC-9.6 | Changed: "Prices paused" only while a watched market is open (AC-10.8) |
| AC-9.7 | Changed: an item waiting while its market is closed says when the first price comes |
| AC-9.9 | Changed: "on screen" is the strip, the Watchlist page or an item's detail |
| AC-9.11 | Changed: remove and reorder in the Watchlist's Edit mode |
| AC-9.12 | Changed: tapping an item opens its detail, which lists the news cards |
| AC-9.15 | Changed: decided by the market calendar (AC-10.9), with v0.4.0's clock rule as the fallback |

## Architecture impact
The market adapter learns two optional parts of the contract and a clock fallback, and the React app gains a shared price reader (`src/prices.tsx`) used by the strip, the Watchlist and the item detail. See [ADR-0006](../adr/0006-watchlist-v2-and-calendar-fallback.md).

## Verification
To be filled in when the tests have run.

## Notes
- The Market Gateway change E1 (PR akkiverse/market-gateway#12) is built but not released. Until it is, Distill works out gold types itself, uses its own market hours (no exchange holidays), and the India gold rate, gold funds and Sovereign Gold Bonds can't be found because the gateway doesn't list them yet.
- Follows the round-1 designs. Small departures are listed in the test report's design checklist.
