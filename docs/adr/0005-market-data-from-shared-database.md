# ADR-0005: Read prices from the founder's shared market database

- **Status:** Accepted
- **Date:** 2026-11-26
- **Change request:** CR-0005

## Context
The founder wants live prices for gold, Indian and US shares in Distill (board change E4). Indian prices need a broker session (Zerodha Kite Connect) that expires every day and needs a manual login, which a stateless Vercel function can't hold, and the founder doesn't want market-data keys copied into every app. The founder agreed a [market data contract](https://github.com/akkiverse/idea-studio/blob/main/docs/contracts/market-data.md) on 26 Nov 2026: a private Market Gateway on his laptop writes prices into a separate Neon database (schema `market`), and apps read it with a limited `app` role.

## Decision
- A `MarketData` adapter (`backend/distill/market.py`). The live `PostgresMarket` connects to `MARKET_DATABASE_URL` with `psycopg` 3, one short connection per request (prepared statements off for Neon's pooled address), and only `SELECT`s `market.instruments`, `market.prices` and `market.gateway_status`, and upserts `market.watch_symbols`. `FakeMarket` is used in tests; with no `MARKET_DATABASE_URL` there is no adapter and the app says "Price source not set up yet".
- `DATABASE_URL` (Distill's own account database) is never used for market tables, and Distill never writes `market.prices` or calls a price provider.
- Display rules (labels, the 2-minute paused rule, Zerodha prices for the founder only) are applied on the server in `market.py`, so they are tested in one place and Zerodha prices never leave the server for other people.
- The watchlist itself (keys in order) is part of each person's synced account copy (`UserState.watchlist`), merged newest-wins like topics.

## Consequences
- Distill's Prices depend on the founder's laptop: when the gateway stops, prices show "Prices paused since <time>" with the last values.
- A second database connection per price read (every 30 seconds while Prices is on screen in market hours). Reads are small; the market database's compute is the gateway's concern.
- Changing the contract needs a change request on both sides.
