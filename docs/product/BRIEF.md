# Distill: Product brief

> Summary of the approved Business Brief. Full brief: https://claude.ai/artifact/VHC3gL388dnY2jGdQiaASV
> Idea Document: https://claude.ai/artifact/WKJhdodgAenT7e9mPoa1DE

**Verdict:** REFINE (61/100), approved for build as a personal tool on 2026-11-25

## The problem
Social feeds are where many people get their news, and they are built to keep you scrolling. People who want to stay informed end up either doomscrolling or avoiding news because it overwhelms them. Distill is a purposeful alternative: open it, read a short finished set of summaries on exactly what you care about, and leave.

## Who it is for, and who pays
- **Now:** the founder, plus a few friends or family invited through Studio Accounts. Nobody pays; this is a personal tool.
- **Possibly later:** people who track one topic closely (gold and commodity rates, a stock, a sport) and want it summarised without opening social apps.
- In their words: "Tell me what changed on the things I care about, in two minutes, then let me go."

## Why this, why now
The studio already runs a private AI server (Studio AI) and shared sign-in (Studio Accounts), so a private AI-curated feed costs little to build and run. Interest in AI news summaries is real, and a growing number of people run their own models.

## Competition and our edge
| Alternative | Strength | Gap |
|---|---|---|
| Short-news card apps | Short cards, big reach in India | Endless feed, no keyword topics, ads |
| Google News and similar aggregators | Broad coverage, topic following | Endless feed, tracking, no summaries of your own topics |
| AI news summary apps | Polished AI story summaries | Cloud AI, weak keyword control |
| Google Alerts and RSS readers | Exact keywords | Raw links, no summaries or visuals, items pile up |

**Edge in one line:** your own private AI makes a finished, keyword-exact feed that ends and cleans itself up.

## Revenue model
None for the MVP: it is a personal tool, and the free news sources it uses are for non-commercial use. The business question is revisited after 30 days of real use.

## Success metrics (first 30 days)
- The founder opens Distill on at least 20 of 30 days.
- Median session under 5 minutes, ending at "You're up to date".
- At least 70% of cards are useful (saved or not skipped).
- A refresh of 3 topics finishes in under 60 seconds.

## What the real version needs
Accounts, services and keys required beyond the MVP:
- Studio AI linked to the project (shared `AI_ENDPOINTS`, `AI_GATEWAY_KEY`).
- The data server (Postgres behind PostgREST and Caddy, on the founder's home server) and its `DATA_ENDPOINT`, `DATA_GATEWAY_KEY` in Vercel, for sync across devices. Until then everything stays on the device.
- Optional free news API keys set by the founder in Vercel: `GUARDIAN_API_KEY`, `NEWSDATA_API_KEY`, `CURRENTS_API_KEY`, `MARKETAUX_API_KEY`.

## Risks and compliance flags
- **News licensing:** show the source name and link on every card, keep only headlines and snippets, never republish full articles. Review licences before any public or paid launch.
- **Wrong AI summaries:** cards are labelled "AI summary", link the source, and only chart numbers that appear in the source text.
- **AI offline:** headline-only cards and "AI is offline right now"; saved cards stay readable.
- **Personal data:** only the Studio Accounts identity, chosen topics and saved cards. Keep it that way.
