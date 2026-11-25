# ADR-0002: Tier R stack: React + Vite + TypeScript with FastAPI on Vercel

- **Status:** Accepted
- **Date:** 2026-11-25
- **Change request:** CR-0001

## Context
Distill's interface is the product: a single-column card feed with small charts, a detail view, bottom navigation and an app-like feel on phones. It also needs a server: news sources must be fetched server side (browsers can't read most RSS feeds across origins), and Studio AI and the data server keys must never reach the browser.

## Decision
- **Tier R, React.** React 18 + Vite + TypeScript for the interface; FastAPI (Python 3.12, Pydantic v2, httpx) in `api/index.py` with all routes under `/api`, shared code in `backend/distill/`. One Vercel project in Singapore (`sin1`).
- React rather than Vue because the spec leans on card visuals and charts and a possible native app later. Charts are drawn as small inline SVG components rather than a charting library, to keep the first load under 2 seconds on 4G (only bar charts of 2 to 6 values are needed).
- Python libraries beyond the defaults: `feedparser` for RSS. Title similarity uses a small word-overlap function instead of `rapidfuzz`, because the spec defines the rule as word overlap.
- Sign-in with the Studio Accounts Routing Middleware (`middleware.js`); the API reads the same session token with the hub's `studio_auth.py` to know whose data to sync.
- AI with the Studio AI kit (`backend/distill/studio_ai.py`, copied unchanged).

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Tier H (FastAPI + HTMX) | Python only, simpler | Card feed with offline copy and progressive "Summarising 3 of 12" is awkward without a client app |
| Tier R with Vue 3 | Smaller bundle | The spec names React and its ecosystem |
| Tier R with React (chosen) | Fits the spec; rich component ecosystem | Two languages in one repo |

## Consequences
- CI runs both `uv run pytest` and `npm test`/`npm run build`.
- The browser keeps a copy of the person's data so the feed works when the data server is off.
