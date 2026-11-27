# ADR-0008: Read articles on the server for detailed summaries, and keep only the summary

- **Status:** Accepted
- **Date:** 2026-11-27
- **Change request:** CR-0011

## Context
Board change E10 asks for detailed summaries written from the real article, not only the headline and feed snippet. The browser can't read publishers' pages (other sites don't allow it), Vercel functions are stateless with a 120-second limit, and the founder asked that only the AI's summary is stored, never the article, and that each story is summarised once.

## Decision
- A new `ArticleReader` adapter (`HttpArticleReader`) fetches the article page on the server: 8-second limit, at most 2 MB, at most 4 redirects, each hop checked against private-network addresses (the same rule as AC-12.3). It keeps the paragraphs inside `<article>`/`<main>` (or every paragraph when there are too few there), without scripts, menus, captions, related links or footers, up to 12,000 characters. Fewer than 400 characters counts as unreadable (a teaser, paywall or cookie wall). Google News links are unreadable at once (they reach the publisher only through a script).
- A new `Detailer` adapter (`StudioAIDetailer`) sends that text to Studio AI with a JSON schema (summary and points); the answer is checked like the curator's: trimmed, de-duplicated, at most 10 points, and anything with a number the article doesn't state is dropped.
- One story per request (`POST /api/feed/detail`), called by the app in the background one at a time, so each call stays well inside the function limit. The answer is kept in the card itself (`detail_*` fields) and syncs through the account like the rest of the card; there is no server-side cache and the article text is never stored.

## Consequences
- No new service, key, table or cost. Rolling back to v0.7.0 is safe: v0.7.0's models ignore the new optional card fields.
- Some publishers block servers or paywall their stories; those keep the short summary, as the founder asked.
- The AI server does more work per story (reading a few thousand words); it is spread out in the background and stops while the AI is offline.
