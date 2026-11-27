# Distill: Design

## Subject and audience
A personal news reader for the founder and a few invited friends: people who want to know what changed on a handful of topics, on a phone in a short break or at a desk in the morning, and then stop. Personality: calm, clear, finished.

## The main screen's one job
Show today's few summarised stories on the reader's topics, newest first, and end clearly at "You're up to date".

## Palette
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #f4f2ec | #121715 | Page background: quiet, paper-like |
| `--surface` | #fffefb | #1a211e | Cards, inputs, bottom navigation |
| `--ink` | #1b2420 | #e6ebe8 | Text and headlines |
| `--muted` | #5b6661 | #9ba7a1 | Meta lines, hints, secondary links |
| `--line` | #e2ded4 | #2b3531 | Borders and dividers |
| `--teal` | #0f766e | #5ec4b6 | The one accent: brand, AI label, chart bars, active tab, focus ring |
| `--teal-soft` | #e1f0ed | #1d3430 | Topic chips, selected sections |
| `--danger` | #b42318 | #f97066 | Real errors only |

## Typography
- Headlines: **Source Serif 4** (600, self-hosted from `@fontsource`), for the editorial feel of a good paper.
- Interface and body: the system sans (`ui-sans-serif, system-ui`), crisp and fast, with no extra download.
- Sizes: card headline 1.22rem, post headline 1.7rem, body 16px with 1.55 line height; text column at most 680px.

## Layout
A single column of cards, centred, at most 680px wide. Phones get a fixed bottom navigation (Feed, Saved, Topics) with 44px+ targets; from 760px the same links move to the top bar. Topic chips sit under the title. Each card: source · time ago · topic, serif headline, "AI summary" label, summary, key points, then a small chart or figure chips, and a footer with the source link and a bookmark.

## The memorable element
The end of the feed: after the last card the page stops at a teal check that draws itself once, "You're up to date", and the time of the next refresh. No infinite scroll, no counters, no badges.

## States
- **Empty feed (no topics):** "Choose your topics to start" with a Choose topics button.
- **Feed with topics but no stories:** "Press Refresh to gather today's stories." or "No new stories matched your topics since the last refresh."
- **Loading:** the Refresh button spins and the line under the title says "Fetching news", then "Summarising 3 of 12", with a thin progress bar.
- **AI offline:** a calm banner and a note "AI is offline right now. You'll see headlines only until it's back."; those cards say "Headline only".
- **A source failed:** a collapsed note "Couldn't reach <source>" that lists them; the rest of the feed is complete.
- **Topics error:** "Pick at least one section".
- **Expired post:** "This post has expired" with Back to feed.
- **Saved empty:** "Nothing saved yet. Tap the bookmark on any post."
- **Data server offline:** toast "Saved on this device, will sync later" and a small "Not synced yet" tag in the header.

## Prices (CR-0005; replaced by the Watchlist and strip in CR-0006)
- **Job:** glance at a handful of prices and know, at once, how fresh each one is.
- **Layout:** on the Feed, one folding panel above "Your feed" (open by default, remembered per device); the Prices tab shows the same list full width. Each row: name and symbol on the left, price and change on the right in tabular figures; below, the price's time in Indian time and its label; move up, move down and remove as 44 px icon buttons.
- **Colour tokens added:** `--up` (#1a7f37 light, #57c785 dark) for rises, `--down` (= `--danger`) for falls, `--amber` and `--amber-soft` for "Delayed" and "Prices paused". Live uses the existing teal chip; "Market closed" a grey chip. Colour is never the only signal: the change also carries its + or - sign and the label is written out.
- **States:** no items ("Add gold or a share to follow its price"), waiting ("Waiting for the first price"), paused (amber note with the last check-in time, only while a watched market is open), markets closed (quiet grey note with a moon icon: "Markets closed, prices from the last close"), not set up ("Price source not set up yet") and unreachable ("Prices can't be reached right now"), each in plain words; the information-only note and, with gold spot, the MetalCharts credit link sit under the list.
- **Motion:** none; prices change in place.

## Watchlist and pinned strip (CR-0006)
Follows the Designer's round-1 designs (approved for the build by the founder; [design canvas](https://claude.ai/artifact/Lktgxu48sHFMgMpkkq3b9H)).
- **Jobs:** the strip answers "what are my few prices right now?" at a glance on any screen; the Watchlist is where items are added, grouped, pinned and ordered; an item's detail explains one price and what kind of thing it is.
- **Strip:** a full-width band under the header (surface colour, hairline borders), one tile per pinned item: short name and a small type badge, the price in tabular figures, the change. On a phone it scrolls sideways (scroll-snap, no visible scrollbar) and shows the percentage only; from 760 px the tiles share the width, wrap, show the full change ("+10.00 (+0.24%)") and end with a quiet "N more slots · Edit" tile. A one-line note under it carries the calm state ("Markets closed · NSE opens Fri 9:15 AM IST") and, on the Feed, a Watchlist link. Hidden on the Watchlist page on phones (the page lists the same prices), and when nothing is pinned or the setting is Off.
- **Watchlist:** title with Edit and Add on one row, "Pin up to 6 … 4 of 6 pinned" under it, calm notes, then the groups Gold, Indian shares, US shares (small bold grey heading with the count) as rounded lists: name and a badge line on the left, price and % on the right, a star at the end. From 1000 px it reads as a table (Item, Type, Price, Change, Price time) with a side column: "On top of every screen" (the strip order, with grips and arrows) and "Show pinned prices" (a three-part segmented control). Edit mode swaps the star for move up, move down and remove, shows grips for dragging on a computer, and on a phone shows the strip-order panel too.
- **Add sheet:** a bottom sheet on phones, a centred dialog on wide screens: search field (teal border when focused), filter chips (the chosen one filled teal), then results under headings; the five gold kinds each with their badge and a one-line explanation, then Indian and US shares. Each result: tidy name, a short line, and an Add button (or a greyed "Added").
- **Item detail:** back link, badge with symbol and exchange, the serif name, the price large (2.1rem, bold, tabular), the change "since the previous close", one muted line with the market state and next opening, "Pinned on top / Pin on top" (filled when pinned) and Remove, a "What this is" box, a small key-value box (price time, label, source, updates), "In your news", and the information-only note.
- **Colour tokens added:** `--gold` (#7a5c0e light, #d9b45a dark) on `--gold-soft` (#f5ecd4 light, #33291a dark) for gold badges only. Other badges are outlined in `--line` with `--muted` text. Amber stays reserved for "Prices paused" while a market is open; closed markets, holidays and "before the first price" are quiet surface notes with a moon, calendar or clock icon; unreachable is the red-outlined error note.
- **States:** empty Watchlist ("Add gold or a share to follow its price" + Add an item), loading (strip tiles show a grey bar and "Loading"), waiting per item ("First price when NSE opens, Fri 9:15 AM IST" or "Waiting for the first price"), not set up, unreachable, paused, closed, holiday, item gone ("This item isn't in your watchlist").
- **Motion:** only the sheet's short slide-in; prices change in place.

## Night desk (CR-0008): the new look and the theme switch
The founder asked for a look that is "smooth and cool", with a light and dark switch and AI diagrams, using two mock-ups as suggestions only ([CR-0008](../changes/CR-0008-ui-refresh.md)). Distill keeps its one job and its end ("You're up to date"); what changes is the surface.

- **Concept:** a reading desk at night. Dark mode is the hero: deep blue-black glass panels over a faint teal-and-indigo glow at the top of the page; light mode is crisp cool white with the same accents. Cards are glass: a translucent surface, a hairline border that turns into a soft teal-to-cyan gradient edge on hover and focus, and a gentle lift.
- **Palette (replaces the paper tokens; same token names so every screen follows):**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #eef2f6 | #070b12 | Page background (with the glow layer on top) |
| `--surface` | #ffffff | #0f1622 | Cards, sheets, inputs (used with 86 to 92% opacity and blur where it floats) |
| `--surface-2` | #f5f8fb | #141d2c | Raised areas inside a card: cover band text box, chart tracks, notes |
| `--ink` | #0e1726 | #e8eef7 | Text and headlines |
| `--muted` | #536173 | #93a1b5 | Meta lines, hints, secondary links |
| `--line` | #dbe3ec | #1f2a3b | Borders and dividers |
| `--teal` | #0b7a72 | #2dd4bf | The accent: active tab, focus, links, chart lines |
| `--cyan` | #0e7490 | #38bdf8 | Second stop of the accent gradient (`--accent-grad`: teal to cyan) |
| `--teal-soft` | #dff3f0 | #10302f | Chips, selected states |
| `--glow` | rgba(13,148,136,.18) | rgba(45,212,191,.22) | Soft glow behind active and focused things |

  Prices keep `--up`, `--down`, `--amber` and `--gold` (dark values brightened for the new background). Every text pair meets AA in both themes.
- **Topic colours:** each section has a hue for its card cover (Finance amber, Technology violet, Business blue, Sports green, Science cyan, Health rose, World indigo, India saffron, Politics slate-red, Environment emerald, Entertainment pink, Education sky; keyword topics teal). The cover is a 2-stop gradient of that hue at low strength with a fine grid pattern, so white or ink text sits on it with AA contrast in both themes.
- **Typography:** headlines and the wordmark in **Sora** (600 and 700, self-hosted from `@fontsource/sora`), a geometric face that reads modern without being a default; body and interface stay the system sans for speed. Card headline 1.18rem, post headline 1.8rem; the AI cover theme in Sora 700 at .78rem, letter-spaced, uppercase, the one place capitals are used.
- **Header:** frosted glass, sticky at the top, wordmark with the gradient funnel mark, navigation pills on wide screens with a glowing underline on the active one, then the theme switch: a 3-part segmented control (System, Light, Dark; icons with text for screen readers) that shrinks to icons on a phone.
- **Cards:** cover band first (topic icon and name on the left, AI theme below it in the cover style, the compact diagram on the right on wide cards and under it on phones), then source and time, the headline, the AI summary, key points with teal dots, and the footer. Headline-only cards keep a plain glass card with no cover.
- **Diagrams (AC-11.5, AC-11.6):** drawn in SVG with the accent gradient: **bars** as rounded horizontal bars with values; **change** as two values joined by an arrow with the difference and percentage (green up, red down, with the sign written); **trend** as a smooth line with dots and an area fade, labels at the ends; **steps** as numbered nodes joined by a line (vertical on phones and in the card, horizontal in the post when it fits). The card shows a compact version (at most 120 px tall); the post shows it full size with its title and unit.
- **Chips:** topic chips carry a small line icon per section; the selected state has the gradient border and glow.
- **Motion:** cards rise and fade in once (staggered, 40 ms), the theme switch cross-fades colours over 200 ms, buttons and tabs ease on hover and press; the end-of-feed check still draws itself. All of it is off under `prefers-reduced-motion`.
- **States:** unchanged in wording; notes and errors take the glass surface. Empty Feed gets the funnel mark large and faint above "Choose your topics to start".

## CR-0010: Settings → Sources and News sources

- **Settings → Sources:** one rounded panel per section (its section icon in the legend) with plain rows: source name on the left, a teal switch on the right (48 px rows, 46×28 switch; the off track is a muted grey that reads in both themes). An amber note inside a panel warns when every source in it is off.
- **News sources (admin):** a wide page with a status line, "Check all now" and "Add a source" in one bar; each source is a card with name and an On (teal) / Paused (outlined, dashed card) / Needs a key (amber) badge, its address in small monospace, sections, and the last check (failing in the danger colour). Actions are 44 px buttons; Remove opens an inline confirmation with a danger button.
- Header: a gear icon (Settings) beside the theme switch.
