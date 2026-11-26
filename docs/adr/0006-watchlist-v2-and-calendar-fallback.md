# ADR-0006: Watchlist version 2, and the gateway's optional calendar and categories with Distill's own fallback

- **Status:** Accepted
- **Date:** 2026-11-26
- **Change request:** CR-0006

## Context
Board change E5 adds a pinned strip, a 20-item Watchlist with pins and a strip setting, the five gold types and calm closed-market messages. Two things make this delicate:
1. The Market Gateway's change E1 adds `instruments.category` and a `market.market_calendar` table, but it is not released, and the two apps release separately. Distill has to work against the gateway as released today (no category, no calendar) and pick up the new parts by itself once they exist.
2. Existing watchlists were saved by v0.4.0 as `{keys (up to 10), updated_at}`, and v0.4.0 refuses a copy with more than 10 keys. A device can stay on v0.4.0 for a while (an open tab), and a rollback to v0.4.0 must stay possible.

## Decision
- **Optional contract parts are detected, not assumed.** `PostgresMarket` asks `information_schema.columns` (in the same connection as the read) whether `instruments.category` and `market_calendar` exist, and remembers the answer for 10 minutes. Without the column, the category is worked out from the key, symbol and name with the same rules as the gateway (`category_of`); without the table, or when a calendar row no longer fits the current time (open after its close time, closed after its next opening), Distill's own market hours are used (`hours.py`: NSE 9:15 AM to 3:30 PM IST, US 9:30 AM to 4 PM New York time, MCX 9 AM to 11:30 PM IST (11:55 PM while New York is on standard time); weekdays only, no holidays; gold spot counts as open while NSE or the US market is, because the gateway only checks in then). Each market in the answer says whether it came from the gateway or the clock.
- **Prices, heartbeat and calendar are read over one connection** (`snapshot`), so the extra data adds no connection to the 30-second read.
- **The calm-state wording is decided in the browser** (`src/watch.ts`), from the server's `markets` map and the gateway's paused flag, because it combines with states only the browser knows (the source can't be reached, the strip versus the page).
- **Watchlist version 2** keeps `keys` for the first 10 items and adds `more` (items 11 to 20), `pinned` (up to 6, in strip order), `strip` (`every`, `feed`, `off`) and `version: 2`. A versioned migration (`upgrade_watchlist`, `upgradeWatchlist`) upgrades a v0.4.0 watchlist on load: its first 6 items are pinned (the Feed keeps showing them on top) and the strip is on every screen. When a newer change arrives without the new fields (from a v0.4.0 device), its `keys` win and the stored `more`, `pinned` and `strip` are kept. The strip setting lives in the watchlist rather than `settings`, because the watchlist already merges newest-wins and `settings` takes whatever a device sends.

## Consequences
- v0.4.0 can still read a copy saved by v0.5.0 (it sees the first 10 items and ignores the rest), so a rollback is safe; items 11 to 20, pins and the setting would be dropped the first time v0.4.0 saves.
- Until the gateway's E1 is released, holidays are unknown to Distill, and the India gold rate, gold funds and Sovereign Gold Bonds can't be found (the gateway doesn't list them yet).
- Category and name rules exist in two places (the gateway and Distill's fallback); the gateway's column wins whenever it is set.
