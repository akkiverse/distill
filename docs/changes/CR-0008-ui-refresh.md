# CR-0008: A smoother look, a theme switch and AI-drawn story diagrams

- **Status:** In review
- **Requested by:** Founder (board, new feature E7 "UI")
- **Date:** 2026-11-27
- **Release:** not yet (feature, v0.6.0 when released)
- **Pull request:** (added when opened)
- **Issue:** Closes #18 (US-11)

## Why
The founder's words: "The current UI look and feel is not attractive. I want it smooth and cool. As a user if I login to app I should have the option to make the theme dark or light. Also using Ollama models generate some graph diagram to make post look catchy. Show graphs and all. Check attached for UI suggestion. Those images are only suggestion, no need to copy the exact but make something better."

Distill v0.5.1 follows the system's light or dark setting with no way to choose, its cards are plain paper boxes with text only, and the only picture a story can get is a small bar chart when it has two or more numbers in the same unit.

## References
| Reference | What it shows | How it is used |
|---|---|---|
| [IMG_5518.png](attachments/CR-0008/IMG_5518.png) (founder upload, desktop mock-up "Pulse News") | Dark, glassy news dashboard: ticker strip with tiny trend lines, domain chips with icons, a side panel of market tiles, large image-led story cards with a short all-caps theme label, a source logo row and a "Bullish" tag | Mood and ideas only: dark glass surfaces, chips with icons, a strong cover on each card with a short theme label, livelier strip tiles |
| [IMG_5517.png](attachments/CR-0008/IMG_5517.png) (founder upload, phone mock-up of the same) | The same look on a phone: header with search and avatar, ticker, chips that scroll, "Market Focus" cards, story cards with a glowing gradient border, bottom navigation with five tabs | Phone layout cues: compact header, scrolling chips, glowing card edges, a clear active tab |

Not taken from the references, on purpose: stock photos (Distill has no images and never shows the full article), trend lines in the strip (Distill has no price history; see "Not in this change"), a "Bullish" tag (that reads as investment advice; Distill's prices are information only), and the extra tabs (Analytics, Settings) the app does not need.

## What changes
- **What people notice:**
  - A new look, "Night desk": deep blue-black glass in dark mode and crisp cool white in light mode, a teal-to-cyan accent that glows softly on the active tab, chips and focus rings, a frosted header, and smoother movement (cards rise in, buttons and tabs ease; all of it switched off when the device asks for reduced motion). Headlines move to Sora, a geometric display face; the body stays the fast system sans.
  - A theme switch in the header: System, Light or Dark. It applies at once on every screen, is remembered on the device (no flash of the wrong theme when the app opens) and is kept with the person's account, so it follows them to other devices.
  - Every AI-summarised card gets a cover band in its topic's colour with a short theme the AI picked for the story (for example "The AI chip rush"), and, when the story suits one, a small diagram the AI chose: bars comparing numbers, a before-and-after change, a short trend over time, or a flow of 2 to 5 steps. The post page shows the same diagram full size with its title and a text version for screen readers.
  - Topic chips get small icons; the pinned prices strip, the Watchlist and the bottom navigation pick up the new surfaces.
- **Underneath:**
  - The AI's answer gains two optional fields, `cover` (2 to 5 words) and `visual` (`kind` bars, change, trend, steps or none, a title, and its points or steps). Both are checked like the key figures: every number must appear in the headline or snippet, labels and steps are trimmed, and a diagram that fails a check is dropped (the card then shows the key-figure chart or chips as before).
  - `Card` gains optional `cover` and `visual`; `Settings` gains optional `theme_changed_at`, and the account merge keeps the newer theme choice.
  - The theme is applied as `data-theme` on the page before React starts, from the device copy.

## Spec impact
| Criterion | Change |
|---|---|
| AC-11.1 | Added: theme switch (System, Light, Dark) in the header; applies at once on every screen; kept on the device and in the account |
| AC-11.2 | Added: the saved theme is applied before the app draws, and the browser's bar colour matches |
| AC-11.3 | Added: the newer theme choice wins when devices sync; a device without a theme time can't overwrite a newer choice |
| AC-11.4 | Added: AI cover theme on the card's cover band (2 to 5 words, at most 40 characters), topic name when there is none |
| AC-11.5 | Added: AI-chosen diagram (bars, change, trend, steps) checked against the story text; dropped when a check fails |
| AC-11.6 | Added: the card shows the diagram compactly, the post full size with its title and a text version |
| AC-11.7 | Added: cards and settings saved by v0.5.1 load and look as before, with a cover in the topic's colour |
| AC-4.2 | Changed: the key-figure chart or chips show when the card has no AI diagram |
| Look and feel | Changed: "Night desk" look, Sora headlines, theme switch; still no infinite scroll, counters or alerts |
| Out of scope | Changed: AI-drawn diagrams are now in scope (bars, change, trend, steps); free-form AI drawings and AI images stay out |

## Architecture impact
No new routes, services or keys. The curator's prompt and JSON schema grow by two optional fields and their checks (`backend/distill/visuals.py`). The React app gains a theme module (`src/theme.ts`), a diagram component (`src/components/Diagram.tsx`) and a cover band; `index.html` gets a tiny inline script that sets the theme from the device copy. The data model gains optional fields only, so v0.5.1 can still read everything v0.6.0 saves (a rollback stays safe).

## Not in this change
- Trend lines in the pinned strip, like the references' ticker: Distill only reads the latest price, and price charts are out of scope (CR-0005). It needs a price-history table in the Market Gateway first; suggested as a separate change.
- Photos on cards: Distill never shows the full article or its images; the AI cover and diagram take their place.

## Verification
- New `tests/api/test_us11_look_and_diagrams.py` (15 tests): the newer theme choice wins and a v0.5.1 device can't undo it; the AI's cover is kept only at 2 to 5 words and 40 characters; diagrams are kept only with numbers written in the story and the right number of points or steps; malformed answers give no diagram but still a card; the prompt asks for both; v0.5.1 cards and settings read unchanged and what v0.6.0 saves stays readable by v0.5.1.
- New `src/__tests__/us11_look.test.tsx` (8 tests): the switch applies at once on every screen and is saved on the device and sent to the account; a theme from the account is applied on open; the start-up script in `index.html` sets the theme and bar colour before the app draws; cover bands with the AI theme or the topic's name; a diagram replaces the key-figure chart, which stays when there is none; all four kinds draw compactly on cards and full size on the post with text versions; v0.5.1 cards look as before.
- Found and fixed by the tests: a cover that wasn't text (a list) was turned into text instead of being dropped; the theme code read `meta.media`, which some browsers' test environments lack (now reads the attribute).
- Result: 144 of 144 back-end tests and 81 of 81 interface tests passing (225 of 225); Ruff lint and format clean; production build passes (JS 68 kB gzipped, Sora adds two 19 kB font files).
- Visual check at 375 px and 1280 px, light and dark, recorded in the [test report](../quality/TEST-REPORT.md#visual-check-cr-0008) with screenshots.
