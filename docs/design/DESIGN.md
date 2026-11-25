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
