import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { IconAlert, IconSection } from "../components/Icons";
import { ShareSwitch } from "../components/ShareSwitch";
import { useMe } from "../me";
import { useDistill } from "../state";
import type { PersonSource } from "../types";

interface Group {
  id: string;
  name: string;
  items: PersonSource[];
}

/** AC-12.6: the active sources, grouped by section; a source that serves several sections shows in each, with one switch. */
export function groupSources(list: PersonSource[], sections: { id: string; name: string }[]): Group[] {
  const groups: Group[] = sections
    .map((s) => ({ id: s.id, name: s.name, items: list.filter((x) => x.sections.includes(s.id)) }))
    .filter((g) => g.items.length > 0);
  const kw = list.filter((x) => x.sections.includes("keyword"));
  if (kw.length) groups.push({ id: "keyword", name: "Your keywords", items: kw });
  const other = list.filter((x) => x.sections.length === 0);
  if (other.length) groups.push({ id: "other", name: "Other news services", items: other });
  return groups;
}

/** AC-12.9: a section whose every source is off will be empty. */
export function emptyWarning(g: Group, off: Set<string>): string | null {
  if (g.id === "other" || !g.items.every((x) => off.has(x.id))) return null;
  if (g.id === "keyword") return "Every source for keywords is off: your keyword searches will find nothing.";
  return `Every source for ${g.name} is off: your ${g.name} section will be empty.`;
}

export function Settings() {
  const { state, sections, setSourcesOff } = useDistill();
  const me = useMe();
  const [list, setList] = useState<PersonSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .sources()
      .then((r) => alive && setList(r.sources))
      .catch(() => alive && setError("The list of sources can't be loaded right now. Your feed still uses your choices; try again in a moment."));
    return () => {
      alive = false;
    };
  }, []);

  const off = useMemo(() => new Set(state.settings.sources_off ?? []), [state.settings.sources_off]);
  const groups = useMemo(() => (list ? groupSources(list, sections) : []), [list, sections]);
  const toggle = (id: string) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void setSourcesOff([...next]);
  };
  const onCount = list ? list.filter((x) => !off.has(x.id)).length : 0;

  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title" className="screen-title">Settings</h1>
      <h2 className="settings-h">Sources</h2>
      <p className="muted lede">Choose which news sources feed your Distill. Everything is on until you switch it off; your choice follows you to every device and changes only your own feed.</p>
      {me && me.role === "admin" && (
        <p className="small"><a href="#/admin/sources">Manage the source list (admin)</a></p>
      )}
      {me === null || (list === null && !error) ? (
        <p className="muted" role="status">Loading sources…</p>
      ) : !me.signedIn ? (
        <p className="note">Sign in to choose your sources. Until then, Distill uses every active source.</p>
      ) : error ? (
        <p className="note error" role="alert">{error}</p>
      ) : (
        <>
          <p className="small muted" role="status">{onCount} of {list?.length ?? 0} sources on</p>
          {groups.map((g) => {
            const warn = emptyWarning(g, off);
            return (
              <fieldset key={g.id} className="source-group">
                <legend><IconSection id={g.id === "other" ? "world" : g.id} /> {g.name}</legend>
                {warn && <p className="note warn" role="alert"><IconAlert width={16} height={16} />{warn}</p>}
                <ul className="switch-list">
                  {g.items.map((x) => (
                    <li key={x.id}>
                      <label className="switch-row">
                        <span className="switch-name">
                          {x.name}
                          {x.sections.length > 2 && <span className="small muted"> · all sections</span>}
                        </span>
                        <input type="checkbox" role="switch" className="switch" checked={!off.has(x.id)} onChange={() => toggle(x.id)} />
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </>
      )}
      {me && me.role === "admin" && <ShareSwitch />}
    </section>
  );
}
