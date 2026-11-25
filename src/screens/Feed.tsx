import { useEffect, useRef } from "react";
import { CardView } from "../components/CardView";
import { IconCheck, IconCloudOff, IconRefresh } from "../components/Icons";
import { sectionLabel, useDistill } from "../state";
import { AUTO_REFRESH_MS, clock, refreshIsDue, timeAgo } from "../time";

export const AI_OFFLINE = "AI is offline right now"; // AC-3.4

export function Feed() {
  const { state, sections, phase, refresh, lastOutcome, ready } = useDistill();
  const { topics, settings } = state;
  const hasTopics = topics.sections.length > 0;
  const tried = useRef(false);

  // AC-4.5: refresh on open only when the last refresh is more than 3 hours old.
  useEffect(() => {
    if (!ready || tried.current || !hasTopics) return;
    tried.current = true;
    if (refreshIsDue(settings.last_refreshed_at)) void refresh();
  }, [ready, hasTopics, settings.last_refreshed_at, refresh]);

  if (!hasTopics) {
    return (
      <section className="empty" aria-labelledby="empty-title">
        <h1 id="empty-title" className="empty-title">Choose your topics to start</h1>
        <p>Pick a few sections and, if you like, exact keywords. Distill gathers them into one short feed that ends.</p>
        <a className="btn primary" href="#/topics">Choose topics</a>
      </section>
    );
  }

  const feed = [...state.cards].sort((a, b) => Date.parse(b.fetched_at) - Date.parse(a.fetched_at) || Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? "")); // AC-4.1
  const busy = phase.kind !== "idle";
  const last = settings.last_refreshed_at;
  const next = last ? Date.parse(last) + AUTO_REFRESH_MS : null;
  const offline = lastOutcome?.aiStatus === "offline" || (feed.length > 0 && busy === false && feed.every((c) => c.ai_status === "offline"));

  return (
    <section aria-labelledby="feed-title">
      <div className="feed-head">
        <div>
          <h1 id="feed-title" className="screen-title">Your feed</h1>
          <p className="muted small" aria-live="polite">
            {phase.kind === "fetching" ? "Fetching news" : phase.kind === "summarising" ? `Summarising ${phase.done} of ${phase.total}` : last ? `Refreshed ${timeAgo(last)}` : "Not refreshed yet"}
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
