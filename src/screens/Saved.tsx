import { CardView } from "../components/CardView";
import { useDistill } from "../state";

export function Saved() {
  const { state } = useDistill();
  const saved = state.cards.filter((c) => c.saved).sort((a, b) => Date.parse(b.fetched_at) - Date.parse(a.fetched_at));
  return (
    <section aria-labelledby="saved-title">
      <h1 id="saved-title" className="screen-title">Saved</h1>
      {saved.length === 0 ? (
        <p className="muted quiet-empty">Nothing saved yet. Tap the bookmark on any post.</p>
      ) : (
        <div className="cards">{saved.map((c, i) => <CardView key={c.id} card={c} index={i} />)}</div>
      )}
    </section>
  );
}
