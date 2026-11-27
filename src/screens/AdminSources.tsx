import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { IconAlert } from "../components/Icons";
import { useMe } from "../me";
import { useDistill } from "../state";
import { HOUR } from "../time";
import type { AdminSource, AdminSources as List, Section } from "../types";

export const RECHECK_AFTER_MS = 12 * HOUR; // the screen checks every source by itself when the last check is older

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** AC-12.2: the last check in one line: OK with how many stories, or failing since when and why. */
export function checkLine(s: AdminSource): string {
  if (s.missing_key) return `Needs a key: set ${s.key_name} in Vercel to switch it on`;
  if (!s.check) return s.paused ? "Not checked while paused" : "Not checked yet";
  if (s.check.ok) return `OK · ${s.check.stories} ${s.check.stories === 1 ? "story" : "stories"} · checked ${when(s.check.at)}`;
  return `Failing since ${when(s.check.failing_since ?? s.check.at)}: ${s.check.error}`;
}

function sectionNames(ids: string[], sections: Section[]): string {
  if (ids.length === 0) return "Any section or keyword";
  if (ids.length > 6) return "All sections and keywords";
  return ids.map((id) => (id === "keyword" ? "Keywords" : sections.find((s) => s.id === id)?.name ?? id)).join(", ");
}

interface Draft {
  name: string;
  url: string;
  sections: string[];
}

function SourceForm({ initial, sections, fixed, busy, error, onSave, onCancel, label }: {
  initial: Draft; sections: Section[]; fixed: boolean; busy: boolean; error: string | null; label: string;
  onSave: (d: Draft) => void; onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(d);
  };
  const pick = (id: string) => setD({ ...d, sections: d.sections.includes(id) ? d.sections.filter((x) => x !== id) : [...d.sections, id] });
  return (
    <form className="source-form" onSubmit={submit} aria-label={label} noValidate>
      <div className="field">
        <label htmlFor={`${label}-name`}>Name</label>
        <input id={`${label}-name`} type="text" value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} required />
      </div>
      {!fixed && (
        <>
          <div className="field">
            <label htmlFor={`${label}-url`}>Feed address</label>
            <input id={`${label}-url`} type="url" inputMode="url" value={d.url} placeholder="https://example.com/rss" onChange={(e) => setD({ ...d, url: e.target.value })} required />
          </div>
          <fieldset className="sections compact">
            <legend>Sections</legend>
            <div className="section-grid">
              {sections.map((s) => (
                <label key={s.id} className={`section-option${d.sections.includes(s.id) ? " on" : ""}`}>
                  <input type="checkbox" checked={d.sections.includes(s.id)} onChange={() => pick(s.id)} />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      {error && <p className="note error" role="alert">{error}</p>}
      <div className="form-foot row">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? (fixed ? "Saving…" : "Checking the feed…") : "Save"}</button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

export function AdminSources() {
  const me = useMe();
  const { sections } = useDistill();
  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const err = e as ApiError;
    if (err.status === 401 || err.status === 403) setDenied(err.message);
    else setError(err.message || "Something went wrong. Try again.");
  };

  const checkAll = useCallback(async () => {
    setChecking(true);
    try {
      setData(await api.checkSources());
    } catch (e) {
      fail(e);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!me?.signedIn || me.role !== "admin") return;
    let alive = true;
    api
      .adminSources()
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (!d.checked_at || Date.now() - Date.parse(d.checked_at) > RECHECK_AFTER_MS) void checkAll();
      })
      .catch((e) => alive && fail(e));
    return () => {
      alive = false;
    };
  }, [me, checkAll]);

  const act = async (run: () => Promise<List>, done: string) => {
    setBusy(true);
    setFormError(null);
    setError(null);
    try {
      setData(await run());
      setNotice(done);
      setAdding(false);
      setEditing(null);
      setConfirm(null);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401 || err.status === 403) setDenied(err.message);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (me === null) return <p className="muted" role="status">Loading…</p>;
  if (!me.signedIn || me.role !== "admin" || denied) {
    return (
      <section aria-labelledby="admin-title">
        <h1 id="admin-title" className="screen-title">News sources</h1>
        <p className="note">{denied ?? "This screen is for the Distill admin. Sign in with the admin account to manage news sources."}</p>
      </section>
    );
  }

  const list = data?.sources ?? [];
  const on = list.filter((s) => !s.paused && !s.missing_key).length;
  return (
    <section aria-labelledby="admin-title" className="admin-sources">
      <h1 id="admin-title" className="screen-title">News sources</h1>
      <p className="muted lede">The sources Distill reads for everyone. Each person can switch them on or off in Settings; paused sources are not read at all.</p>
      {data && !data.saved_in_database && (
        <p className="note"><IconAlert width={16} height={16} />No account database here: changes last only until this server restarts.</p>
      )}
      <div className="admin-bar">
        <span className="small muted" role="status">
          {data ? `${list.length} sources · ${on} on · ${list.length - on} paused or waiting for a key` : "Loading…"}
          {checking ? " · Checking every source…" : data?.checked_at ? ` · last full check ${when(data.checked_at)}` : ""}
        </span>
        <span className="row">
          <button type="button" className="btn" onClick={() => void checkAll()} disabled={checking || !data}>{checking ? "Checking…" : "Check all now"}</button>
          <button type="button" className="btn primary" onClick={() => { setAdding(true); setEditing(null); setFormError(null); }} disabled={adding}>Add a source</button>
        </span>
      </div>
      {error && <p className="note error" role="alert">{error}</p>}
      {notice && <p className="note" role="status">{notice}</p>}
      {adding && (
        <SourceForm
          label="Add a source" initial={{ name: "", url: "", sections: [] }} sections={sections} fixed={false} busy={busy} error={formError}
          onCancel={() => setAdding(false)}
          onSave={(d) => void act(() => api.addSource(d), `${d.name.trim()} added and checked.`)}
        />
      )}
      <ul className="source-list">
        {list.map((s) => (
          <li key={s.id} className={`source-row${s.paused ? " paused" : ""}`}>
            <div className="source-head">
              <strong>{s.name}</strong>
              <span className={`badge ${s.missing_key ? "warn" : s.paused ? "off" : "on"}`}>{s.missing_key ? "Needs a key" : s.paused ? "Paused" : "On"}</span>
            </div>
            {s.url && <p className="source-url small">{s.url}</p>}
            <p className="small">{sectionNames(s.sections, sections)}</p>
            <p className={`small ${s.check && !s.check.ok && !s.paused ? "failing" : "muted"}`}>{checkLine(s)}</p>
            {s.note && <p className="small muted">{s.note}</p>}
            {editing === s.id ? (
              <SourceForm
                label={`Edit ${s.name}`} initial={{ name: s.name, url: s.url, sections: s.sections }} sections={sections} fixed={s.kind !== "rss"}
                busy={busy} error={formError} onCancel={() => setEditing(null)}
                onSave={(d) => void act(() => api.changeSource(s.id, s.kind === "rss" ? d : { name: d.name }), `${d.name.trim()} saved.`)}
              />
            ) : confirm === s.id ? (
              <div className="confirm" role="alertdialog" aria-label={`Remove ${s.name}?`}>
                <p className="small">Remove {s.name}? Nobody's feed will read it any more. This can't be undone, but you can add the address again later.</p>
                <span className="row">
                  <button type="button" className="btn danger" onClick={() => void act(() => api.removeSource(s.id), `${s.name} removed.`)} disabled={busy}>Remove</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>Keep it</button>
                </span>
              </div>
            ) : (
              <span className="row actions">
                <button type="button" className="btn small-btn" onClick={() => { setEditing(s.id); setAdding(false); setFormError(null); }}>Edit</button>
                <button type="button" className="btn small-btn" onClick={() => void act(() => api.changeSource(s.id, { paused: !s.paused }), `${s.name} ${s.paused ? "resumed" : "paused"}.`)} disabled={busy}>
                  {s.paused ? "Resume" : "Pause"}
                </button>
                {s.can_remove && <button type="button" className="btn small-btn ghost" onClick={() => setConfirm(s.id)}>Remove</button>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
