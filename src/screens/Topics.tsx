import { useState, type FormEvent, type KeyboardEvent } from "react";
import { IconX } from "../components/Icons";
import { useDistill } from "../state";

export const PICK_ONE = "Pick at least one section"; // AC-1.3

export function Topics() {
  const { state, sections, saveTopics } = useDistill();
  const [picked, setPicked] = useState<string[]>(state.topics.sections);
  const [keywords, setKeywords] = useState<string[]>(state.topics.keywords);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    setSaved(false);
    setError(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const addKeyword = () => {
    const k = draft.trim().replace(/\s+/g, " ").slice(0, 60);
    if (k && !keywords.some((x) => x.toLowerCase() === k.toLowerCase()) && keywords.length < 10) setKeywords([...keywords, k]);
    setDraft("");
    setSaved(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const all = draft.trim() ? [...keywords, draft.trim()] : keywords;
    if (picked.length === 0) {
      setError(PICK_ONE);
      return;
    }
    const order = sections.map((s) => s.id).filter((id) => picked.includes(id));
    if (await saveTopics(order, [...new Set(all)])) {
      setKeywords([...new Set(all)]);
      setDraft("");
      setSaved(true);
      window.location.hash = "#/";
    }
  };

  return (
    <form onSubmit={submit} aria-labelledby="topics-title" noValidate>
      <h1 id="topics-title" className="screen-title">Topics</h1>
      <fieldset className="sections">
        <legend>Sections <span className="muted small">(choose as many as you like)</span></legend>
        <div className="section-grid">
          {sections.map((s) => (
            <label key={s.id} className={`section-option${picked.includes(s.id) ? " on" : ""}`}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="kw">Keywords <span className="muted small">(optional; only stories that mention one are kept)</span></label>
        <div className="kw-row">
          <input id="kw" type="text" value={draft} placeholder="for example gold rate" onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} autoComplete="off" />
          <button type="button" className="btn" onClick={addKeyword} disabled={!draft.trim()}>Add</button>
        </div>
        {keywords.length > 0 && (
          <ul className="chips" aria-label="Keywords">
            {keywords.map((k) => (
              <li key={k} className="chip keyword">
                “{k}”
                <button type="button" className="chip-x" aria-label={`Remove keyword ${k}`} onClick={() => { setKeywords(keywords.filter((x) => x !== k)); setSaved(false); }}>
                  <IconX width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="note error" role="alert">{error}</p>}
      {saved && <p className="note" role="status">Topics saved.</p>}
      <div className="form-foot">
        <button type="submit" className="btn primary">Save</button>
      </div>
    </form>
  );
}
