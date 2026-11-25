# CR-0001: First version (MVP)

- **Status:** Released
- **Requested by:** Founder (board: build approved 25 Nov 2026)
- **Date:** 2026-11-25
- **Release:** v0.1.0 (2026-11-25)
- **Pull request:** [#7](https://github.com/akkiverse/distill/pull/7)

## Why
The founder approved Distill as a personal tool: a calm news feed of AI summaries for chosen sections and keywords that ends and cleans itself up, instead of scrolling social media.

## References
| Reference | What it shows | Opened |
|---|---|---|
| <https://claude.ai/artifact/ARpie2DHmeZ6iPqF3HAGrf> | Product Spec, including the founder's decisions and default news sources | Yes |
| <https://claude.ai/artifact/VHC3gL388dnY2jGdQiaASV> | Business Brief | Yes |
| <https://claude.ai/artifact/WKJhdodgAenT7e9mPoa1DE> | Idea Document | Referenced |

## What changes
Everything is new: Topics, Feed, Post detail and Saved screens; news gathering from RSS, Google News, GDELT and optional keyed APIs; AI curation with Studio AI; 24-hour expiry and story replacement; sync across devices through the data server; the data server kit (`data-server/`) for the founder's home server.

## Spec impact
| Criterion | Change |
|---|---|
| AC-1.1 to AC-6.6 | Added |

## Architecture impact
New. See [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), [ADR-0002](../adr/0002-stack.md).

## Verification
51 of 51 tests pass (34 pytest, 17 Vitest), one or more per acceptance criterion; Ruff and the production build pass; visual check at 375px and 1280px in light and dark. See [TEST-REPORT](../quality/TEST-REPORT.md).

## Notes
- Stories published more than 36 hours ago are skipped at fetch time, since they would expire almost at once.
- Keyword searches are filed as their own topic (`kw:<keyword>`) so replacement (AC-6.3) works per keyword.
- Without Studio AI linked, cards are headline-only and say so (no fake summaries).
- Keyed news APIs are off until the founder adds their keys; Marketaux is asked only for finance, business or keyword topics, to stay inside its small free quota.
- The founder still needs to: run the data server (`data-server/README.md`) and add `DATA_ENDPOINT` and `DATA_GATEWAY_KEY`; link `AI_ENDPOINTS` and `AI_GATEWAY_KEY`; add Distill's live address in hub admin and turn sign-in on.
