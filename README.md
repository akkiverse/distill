# Distill

A calm news feed that ends: your chosen sections and keywords, summarised into a short set of cards by your own AI, gone after a day unless you save them.

**Live:** https://distill-akkiverse.vercel.app
**Part of:** [Idea Studio by AkkiVerse](https://idea-studio-akkiverse.vercel.app)

## What it does

Distill is a purposeful alternative to scrolling social media for news. You pick sections (World, India, Finance, Sports and more) and optional keywords ("gold rate"). Distill gathers matching stories from free sources (publisher RSS feeds, Google News, GDELT, and keyed APIs when their keys are set), drops duplicates, and asks Studio AI (the founder's own Ollama server) to keep only the useful ones and summarise each into a card with key points and, where the numbers allow, a small chart. The feed stops at "You're up to date". Unsaved cards disappear after 24 hours or when a newer card on the same story replaces them; saved cards stay and sync across your devices.

## Status

| | |
|---|---|
| Stage | Live: v0.8.0, released 27 Nov 2026 ([live app](https://distill-akkiverse.vercel.app)) |
| Acceptance tests | 308 of 308 passing on `main` (v0.8.0) ([report](docs/quality/TEST-REPORT.md)) |
| Latest change | [CR-0011](docs/changes/CR-0011-detailed-summaries.md): Detailed story summaries in bullet points (E10, released in v0.8.0) |

## Stack

Tier R: React + Vite + TypeScript for the interface, FastAPI (Python 3.12) under `/api` for everything else, one Vercel project in Singapore (`sin1`). See [ADR on the stack](docs/adr/0002-stack.md) and the studio's [stack policy](https://github.com/akkiverse/idea-studio/blob/main/STACK.md).

## Run it locally

```bash
uv sync                                   # Python back end
uv run uvicorn api.index:app --reload --port 8000
npm ci && npm run dev                     # interface on http://localhost:5173 (proxies /api to :8000)
uv run pytest && npm test                 # all acceptance tests
```

Without `AI_ENDPOINTS` and `AI_GATEWAY_KEY` the app shows headline-only cards and "AI is offline right now". Without `DATABASE_URL` (the Neon database, set for Production only) everything is kept on the device only; set `DISTILL_MEMORY_STORE=1` to try sync locally with a memory store. The database tests start a throwaway local Postgres if one is installed.

## How this repo is organised

This product is built with **spec-driven development**: the spec is the source of truth, every acceptance criterion has an automated test, and every change is recorded with its reason.

| Document | What it answers |
|---|---|
| [docs/product/BRIEF.md](docs/product/BRIEF.md) | Why this product exists and the case for it |
| [docs/spec/SPEC.md](docs/spec/SPEC.md) | What it must do: user stories and acceptance criteria (`AC-x.y`) |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | How it is built: components, data, integrations |
| [docs/adr/](docs/adr/) | Why each significant technical decision was made |
| [docs/changes/](docs/changes/) | Every change request: what changed, why, and its effect on the spec |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | Visual identity: palette, type, layout |
| [docs/plan/](docs/plan/) | The build plan and task list |
| [docs/quality/TEST-REPORT.md](docs/quality/TEST-REPORT.md) | Each acceptance criterion, its test, and the result |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to make changes, by hand or through Idea Studio |

## Deployment

Hosted on Vercel. Every pull request gets a private preview; merging to `main` deploys to production at https://distill-akkiverse.vercel.app.
