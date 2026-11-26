import { SaveButton, WhenPublished } from "../components/CardView";
import { Figures } from "../components/FigureChart";
import { IconBack, IconExternal } from "../components/Icons";
import { sectionLabel, useDistill } from "../state";

export function Post({ id }: { id: string }) {
  const { state, sections } = useDistill();
  const card = state.cards.find((c) => c.id === id);
  if (!card) {
    return (
      <section className="empty" aria-labelledby="gone-title">
        <h1 id="gone-title" className="empty-title">This post has expired</h1>
        <p>Unsaved posts leave the feed after a day, or when a newer post on the same story replaces them.</p>
        <a className="btn primary" href="#/">Back to feed</a>
      </section>
    );
  }
  return (
    <article className="post" aria-labelledby="post-title">
      <div className="post-bar">
        <a href="#/" className="btn ghost"><IconBack /> Back</a>
        <SaveButton card={card} />
      </div>
      <p className="card-meta">
        <span className="source">{card.source_name}</span>
        <span className="topic">{sectionLabel(card.topic_section, sections)}</span>
        <WhenPublished card={card} />
      </p>
      <h1 id="post-title" className="post-title">{card.title}</h1>
      {card.summary ? (
        <>
          <p className="ai-label">AI summary</p>
          <p className="summary large">{card.summary}</p>
          <h2 className="sub">Key points</h2>
          <ul className="points">{card.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <Figures figures={card.key_figures} />
        </>
      ) : (
        <p className="headline-only">There's no AI summary for this story yet. The full article has everything.</p>
      )}
      <a className="btn primary read-full" href={card.source_url} target="_blank" rel="noopener noreferrer">
        Read the full article at {card.source_name} <IconExternal width={18} height={18} />
      </a>
      <p className="muted small">AI summaries can get details wrong. Check the original before acting on anything.</p>
    </article>
  );
}
