import { useCallback, useEffect, useReducer, useRef } from "react";
import { CardView } from "../components/CardView";
import { IconArrowUp, IconCheck, IconCloudOff, IconRefresh } from "../components/Icons";
import { sectionLabel, useDistill } from "../state";
import { AUTO_REFRESH_MS, AUTO_TICK_MS, clock, hasTime, refreshIsDue } from "../time";
import type { Card } from "../types";

/** Scrolled further than this, the reader is reading: new cards wait above (AC-8.7). */
export const READING_PX = 120;

/** AC-8.3: newest first by the source's publish time; a card without one sorts by when it was fetched. */
export function feedOrder(cards: Card[]): Card[] {
  const when = (c: Card) => (hasTime(c.published_at) ? Date.parse(c.published_at) : Date.parse(c.fetched_at));
  return [...cards].sort((a, b) => when(b) - when(a) || Date.parse(b.fetched_at) - Date.parse(a.fetched_at));
}

const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export const AI_OFFLINE = "AI is offline right now"; // AC-3.4

export function Feed() {
  const { state, sections, phase, refresh, lastOutcome, aiOnline, ready } = useDistill();
  const { topics, settings } = state;
  const hasTopics = topics.sections.length > 0;
  const tried = useRef(false);
  const last = settings.last_refreshed_at;
  const lastRef = useRef(last);
  lastRef.current = last;
  const attempted = useRef(0);

  /** An automatic refresh, at most once per 15 minutes even if one fails (AC-8.4). */
  const autoRefresh = useCallback(() => {
    if (!visible()) return; // never in the background (AC-8.4)
    const now = Date.now();
    if (now - attempted.current < AUTO_REFRESH_MS || !refreshIsDue(lastRef.current, now)) return;
    attempted.current = now;
    void refresh();
  }, [refresh]);

  // AC-4.5: refresh on open when the last refresh is 15 minutes old or more.
  useEffect(() => {
    if (!ready || tried.current || !hasTopics) return;
    tried.current = true;
    autoRefresh();
  }, [ready, hasTopics, autoRefresh]);

  // AC-8.4: while the Feed is open and visible, every 15 minutes, and on coming back after 15 minutes or more.
  useEffect(() => {
    if (!ready || !hasTopics) return;
    const timer = setInterval(autoRefresh, AUTO_TICK_MS);
    document.addEventListener("visibilitychange", autoRefresh);
    window.addEventListener("focus", autoRefresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", autoRefresh);
      window.removeEventListener("focus", autoRefresh);
    };
  }, [ready, hasTopics, autoRefresh]);

  // AC-8.7: cards on screen while new ones wait above. Held only after a refresh, while the reader is scrolled down.
  const live = feedOrder(state.cards);
  const shown = useRef<Card[]>(live);
  const held = useRef<Card[] | null>(null);
  const seenRefresh = useRef(lastOutcome?.at ?? 0);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const refreshAt = lastOutcome?.at ?? 0;
  if (refreshAt !== seenRefresh.current) {
    seenRefresh.current = refreshAt;
    const before = new Set(shown.current.map((c) => c.id));
    if (held.current === null && window.scrollY > READING_PX && live.some((c) => !before.has(c.id))) held.current = shown.current;
  }
  const byId = new Map(state.cards.map((c) => [c.id, c]));
  const feed = held.current ? held.current.map((c) => byId.get(c.id) ?? c) : live;
  const heldIds = new Set(feed.map((c) => c.id));
  const waiting = held.current ? live.filter((c) => !heldIds.has(c.id)).length : 0;
  shown.current = feed;

  const release = useCallback(() => {
    if (!held.current) return;
    held.current = null;
    rerender();
  }, []);
  const showNew = () => {
    release();
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  };
  // Back at the top by themselves: the waiting cards can go in without moving anything being read.
  useEffect(() => {
    const onScroll = () => {
      if (held.current && window.scrollY <= READING_PX) release();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [release]);

  if (!hasTopics) {
    return (
      <section className="empty" aria-labelledby="empty-title">
        <h1 id="empty-title" className="empty-title">Choose your topics to start</h1>
        <p>Pick a few sections and, if you like, exact keywords. Distill gathers them into one short feed that ends.</p>
        <a className="btn primary" href="#/topics">Choose topics</a>
      </section>
    );
  }

  const busy = phase.kind !== "idle";
  const next = last ? Date.parse(last) + AUTO_REFRESH_MS : null;
  // AC-3.5: only the live status check or the latest refresh decide this, never the older cards on screen.
  const offline = aiOnline === false;

  return (
    <section aria-labelledby="feed-title">
      {waiting > 0 && (
        <button type="button" className="new-pill" onClick={showNew}>
          <IconArrowUp width={18} height={18} /> {waiting} new
        </button>
      )}
      <div className="feed-head">
        <div>
          <h1 id="feed-title" className="screen-title">Your feed</h1>
          <p className="muted small" aria-live="polite">
            {phase.kind === "fetching" ? "Fetching news" : phase.kind === "summarising" ? `Summarising ${phase.done} of ${phase.total}` : last ? `Last updated ${clock(Date.parse(last))}` : "Not refreshed yet"}
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void refresh()} disabled={busy} aria-busy={busy}>
          <IconRefresh className={busy ? "spin" : ""} /> {busy ? "Refreshing" : "Refresh"}
        </button>
      </div>
      <ul className="chips" aria-label="Your topics">
        {topics.sections.map((s) => <li key={s} className="chip">{sectionLabel(s, sections)}</li>)}
        {topics.keywords.map((k) => <li key={k} className="chip keyword">“{k}”</li>)}
      </ul>
      {busy && phase.kind === "summarising" && (
        <div className="progress" role="progressbar" aria-label="Summarising" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
          <span style={{ width: `${(phase.done / Math.max(1, phase.total)) * 100}%` }} />
        </div>
      )}
      {offline && (
        <p className="note ai-note" role="status"><IconCloudOff /> {AI_OFFLINE}. You'll see headlines only until it's back.</p>
      )}
      {lastOutcome?.aiStatus === "not_configured" && <p className="note" role="status">AI summaries aren't set up yet, so cards show headlines only.</p>}
      {lastOutcome?.error && <p className="note error" role="alert">{lastOutcome.error}</p>}
      {lastOutcome && lastOutcome.failedSources.length > 0 && (
        <details className="note sources-note">
          <summary>Couldn't reach {lastOutcome.failedSources.length === 1 ? lastOutcome.failedSources[0] : `${lastOutcome.failedSources.length} sources`}</summary>
          <p className="small">{lastOutcome.failedSources.join(", ")}. The rest of your feed is complete.</p>
        </details>
      )}
      {feed.length === 0 && !busy && (
        <p className="muted quiet-empty">{last ? "No new stories matched your topics since the last refresh." : "Press Refresh to gather today's stories."}</p>
      )}
      <div className="cards">{feed.map((c, i) => <CardView key={c.id} card={c} index={i} />)}</div>
      {feed.length > 0 && !busy && (
        <div className="the-end" data-testid="up-to-date">
          <IconCheck width={36} height={36} className="end-check" />
          <p className="end-title">You're up to date</p>
          {next && <p className="muted small">Next refresh after {clock(next)}</p>}
        </div>
      )}
    </section>
  );
}
