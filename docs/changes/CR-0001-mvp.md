# CR-0001: First version (MVP)

- **Status:** In progress
- **Requested by:** Founder (board: build approved 25 Nov 2026)
- **Date:** 2026-11-25
- **Release:** (not yet released)
- **Pull request:** (opened when the build is ready)

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
To be filled when the build is tested.

## Notes
None yet.
