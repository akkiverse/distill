import { sectionLabel, useDistill } from "../state";
import { timeAgo } from "../time";
import type { Card } from "../types";
import { Figures } from "./FigureChart";
import { IconBookmark } from "./Icons";

const HEADLINE_ONLY: Record<string, string> = {
  offline: "Headline only: AI was offline when this was fetched.",
  not_configured: "Headline only: AI summaries aren't set up yet.",
  error: "Headline only: the AI couldn't summarise this one.",
};

export function SaveButton({ card }: { card: Card }) {
  const { toggleSave } = useDistill();
  return (
    <button type="button" className="icon-btn save-btn" aria-pressed={card.saved} onClick={(e) => { e.stopPropagation(); void toggleSave(card.id); }}
      aria-label={card.saved ? `Unsave “${card.title}”` : `Save “${card.title}”`}>
      <IconBookmark filled={card.saved} />
    </button>
  );
}

export function CardView({ card, index = 0 }: { card: Card; index?: number }) {
  const { sections } = useDistill();
  const summarised = card.ai_status === "ok" && !!card.summary;
  return (
    <article className="card" style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }} data-testid="card">
      <div className="card-meta">
        <span className="source">{card.source_name}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={card.published_at ?? card.fetched_at}>{timeAgo(card.published_at ?? card.fetched_at)}</time>
        <span className="topic">{sectionLabel(card.topic_section, sections)}</span>
      </div>
      <h2 className="card-title">
        <a href={`#/post/${card.id}`} className="card-link">{card.title}</a>
      </h2>
      {summarised ? (
        <>
          <p className="ai-label">AI summary</p>
          <p className="summary">{card.summary}</p>
          <ul className="points">{card.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <Figures figures={card.key_figures} />
        </>
      ) : (
        <p className="headline-only">{HEADLINE_ONLY[card.ai_status] ?? HEADLINE_ONLY.offline}</p>
      )}
      <div className="card-foot">
        <a href={card.source_url} target="_blank" rel="noopener noreferrer" className="quiet-link">Open at {card.source_name}</a>
        <SaveButton card={card} />
      </div>
    </article>
  );
}
