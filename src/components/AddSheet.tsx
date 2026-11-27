import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { MAX_PINNED, MAX_WATCH, NOT_SET_UP, TOO_MANY, UNREACHABLE } from "../markets";
import { useDistill } from "../state";
import type { Group, Instrument } from "../types";
import { GOLD_KINDS, GROUPS, KIND, allKeys, categoryOf, groupOf, isGold, nameOf, pinnedKeys, searchLine } from "../watch";

const CHIPS: { id: Group | "all"; label: string }[] = [{ id: "all", label: "All" }, ...GROUPS];
const goldWords = (q: string) => /gold|^sgb|^xau|sovereign/i.test(q);

/** AC-10.5 (CR-0006): the Add sheet over the Watchlist: search, filter chips, and the gold types under their own headings. */
export function AddSheet() {
  const { state, saveWatchlist } = useDistill();
  const keys = allKeys(state.watchlist);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Group | "all">("all");
  const [hits, setHits] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = () => {
    window.location.hash = "#/watchlist";
  };

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    const group = chip === "all" ? "" : chip;
    if (!term && group !== "gold") {
      setHits([]);
      setSearched(false);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api.marketSearch(term, group)
        .then((r) => alive && (setHits(r), setError(null), setSearched(true)))
        .catch((e: ApiError) => alive && (setError(e.code === "market_not_set_up" ? NOT_SET_UP : UNREACHABLE), setSearched(true)));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, chip]);

  const add = async (inst: Instrument) => {
    if (keys.includes(inst.key)) return;
    if (keys.length >= MAX_WATCH) {
      setMessage(TOO_MANY); // AC-9.2
      return;
    }
    setMessage(null);
    const pinned = pinnedKeys(state.watchlist);
    // AC-10.3: a new item goes on the strip while there's room
    await saveWatchlist({ keys: [...keys, inst.key], pinned: pinned.length < MAX_PINNED ? [...pinned, inst.key] : pinned });
    api.marketWatch([inst.key]).catch(() => undefined); // AC-9.3
  };

  const showGold = (chip === "all" || chip === "gold") && (goldWords(q) || chip === "gold" || hits.some(isGold));
  const goldKinds = goldWords(q) || chip === "gold" ? GOLD_KINDS : GOLD_KINDS.filter((c) => hits.some((h) => categoryOf(h) === c));
  const others = GROUPS.filter((g) => g.id !== "gold" && (chip === "all" || chip === g.id));

  const result = (h: Instrument) => (
    <li key={h.key} className="res">
      <div className="res-text">
        <span className="res-name">{nameOf(h)}</span>
        <span className="res-sub">{searchLine(h)}</span>
      </div>
      {keys.includes(h.key) ? (
        <button type="button" className="add done" disabled>Added</button>
      ) : (
        <button type="button" className="add" onClick={() => void add(h)} aria-label={`Add ${nameOf(h)}`}>Add</button>
      )}
    </li>
  );

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h1 id="add-title" className="sheet-title">Add to watchlist</h1>
          <a href="#/watchlist" className="sheet-done">Done</a>
        </div>
        <label htmlFor="add-q" className="small sheet-label">Search by name or symbol</label>
        <input id="add-q" ref={input} type="search" placeholder="gold, TCS, EPAM…" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
        <div className="filter-chips" role="group" aria-label="Filter">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" className="fchip" aria-pressed={chip === c.id} onClick={() => setChip(c.id)}>{c.label}</button>
          ))}
        </div>
        {message && <p className="note error" role="alert">{message}.</p>}
        {error && <p className="note" role="status">{error}.</p>}
        <div className="sheet-results" aria-live="polite">
          {showGold && goldKinds.map((c) => {
            const list = hits.filter((h) => categoryOf(h) === c);
            return (
              <section key={c} className="kind" aria-labelledby={`kind-${c}`}>
                <h2 id={`kind-${c}`} className="kind-title"><span className="badge gold">{KIND[c].badge}</span>{KIND[c].title}</h2>
                <p className="why">{KIND[c].why}</p>
                {list.length > 0 ? <ul className="res-list">{list.map(result)}</ul> : <p className="muted small none">{KIND[c].none ?? "None in the price service yet."}</p>}
              </section>
            );
          })}
          {others.map((g) => {
            const list = hits.filter((h) => !isGold(h) && groupOf(h) === g.id);
            if (list.length === 0) return null;
            return (
              <section key={g.id} className="kind" aria-labelledby={`kind-${g.id}`}>
                <h2 id={`kind-${g.id}`} className="kind-title">{g.label}</h2>
                <ul className="res-list">{list.map(result)}</ul>
              </section>
            );
          })}
          {searched && !error && hits.length === 0 && !showGold && <p className="muted small">No matches yet.</p>}
          {!searched && !q.trim() && <p className="muted small">Type a name or symbol, or choose Gold to see the five kinds of gold.</p>}
        </div>
        <p className="muted small">You can watch up to {MAX_WATCH} items; {MAX_PINNED} fit on the strip.</p>
      </div>
    </div>
  );
}
