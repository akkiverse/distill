# ADR-0009: Rupee prices from the gateway's rate, price history from `price_points`, and a stored switch for sharing Zerodha prices

- **Status:** Accepted
- **Date:** 2026-11-27
- **Change request:** [CR-0012](../changes/CR-0012-rupees-and-trends.md)

## Context
The founder asked (E11) for every price in rupees first with the dollars in brackets, the dollar-to-rupee rate as an item, small and large trend graphs, and, by his decision of 27 Nov 2026, Zerodha prices for every signed-in user behind an admin switch that needs no release. Market Gateway E4 (v0.3.0) adds the `FX:USDINR` row (the European Central Bank's daily reference rate, via Frankfurter) and `market.price_points` (one point per watched key per 5 minutes, 30 days kept). The gateway on the founder's laptop may not run E4 yet when Distill is released.

## Decision
1. **Rupee prices are worked out on the server** from the gateway's `FX:USDINR` price row, read in the same database round trip as the prices and only when a dollar price is shown. Each dollar item carries `price_inr`, `prev_close_inr` and `change_inr`; the answer carries `fx` (rate, time, error). No currency service is called by Distill. Without a usable rate, both are absent and the app shows the dollar price alone with "₹ rate not available".
2. **History is read from `market.price_points`** through a new read-only `GET /api/market/history` (1d, 1w, 1m; at most 160 points per item, evenly thinned). Whether the table exists is checked with the gateway's other optional parts (every 10 minutes), so a gateway before E4 answers `available: false` instead of an error. 1D means today in the item's market time (New York for US shares, Indian time otherwise), so before a market opens there is no line, as the founder asked. The app reads today's points with the prices, at most every 5 minutes while a market is open and every 30 minutes otherwise; 1W and 1M are read only when chosen on an item's detail.
3. **The sharing switch is one JSON row in Distill's own `distill_settings` table** (key `market_sharing`, the table ADR-0007 made), read at most every 30 seconds per server, On when the row is missing. If it can't be read, Zerodha items go to the founder only (the safe side). Search, watch, prices and history all use the same rule (`market.sees_kite`).
4. Graphs are hand-drawn inline SVG (no chart library), coloured with the existing up and down tokens.

## Consequences
- Works before and after Market Gateway E4: without it, prices look as in v0.8.0 plus the rupee symbol and arrows.
- A dollar item's graph is drawn in rupees at today's rate (the shape is the same; old points are not re-priced at old rates).
- The hub's market data contract (`docs/contracts/market-data.md`, "Rules for apps") still says Zerodha prices are for the founder only; it needs the same change, and the contract needs `FX:USDINR` and `price_points` (already on the hub branch `contract/market-gateway-cr-0005`). This is noted in the pull request; Distill does not change the hub.
- Sharing exchange data from a personal Zerodha account with other people may be limited by Zerodha's or the exchanges' terms; the switch lets the founder turn it off at once.
