import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { dropExpired, loadLocal, saveLocal, type Local } from "./storage";
import { nowIso } from "./time";
import type { AiStatus, Card, Section, SyncStatus, UserState } from "./types";

export const FALLBACK_SECTIONS: Section[] = [
  ["world", "World"], ["india", "India"], ["business", "Business"], ["finance", "Finance"],
  ["technology", "Technology"], ["science", "Science"], ["health", "Health"], ["sports", "Sports"],
  ["entertainment", "Entertainment"], ["politics", "Politics"], ["environment", "Environment"], ["education", "Education"],
].map(([id, name]) => ({ id, name }));

export type RefreshPhase =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "summarising"; done: number; total: number };

export interface RefreshOutcome {
  aiStatus: AiStatus | null;
  failedSources: string[];
  error: string | null;
  added: number;
}

interface Ctx {
  state: UserState;
  sections: Section[];
  sync: SyncStatus;
  notice: string | null;
  phase: RefreshPhase;
  lastOutcome: RefreshOutcome | null;
  ready: boolean;
  saveTopics: (sections: string[], keywords: string[]) => Promise<boolean>;
  toggleSave: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  dismissNotice: () => void;
}

const DistillContext = createContext<Ctx | null>(null);

export function useDistill(): Ctx {
  const c = useContext(DistillContext);
  if (!c) throw new Error("useDistill outside DistillProvider");
  return c;
}

export const SYNC_LATER = "Saved on this device, will sync later"; // AC-6.6

export function DistillProvider({ children }: { children: ReactNode }) {
  const first = useRef<Local>(null as unknown as Local);
  if (first.current === null) {
    const l = loadLocal();
    first.current = { ...l, state: { ...l.state, cards: dropExpired(l.state.cards) } }; // AC-6.1 at load
  }
  const [local, setLocal] = useState<Local>(first.current);
  const [sections, setSections] = useState<Section[]>(FALLBACK_SECTIONS);
  const [sync, setSync] = useState<SyncStatus>("unknown");
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<RefreshPhase>({ kind: "idle" });
  const [lastOutcome, setLastOutcome] = useState<RefreshOutcome | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef(local);
  latest.current = local;

  const commit = useCallback((next: Local) => {
    latest.current = next;
    saveLocal(next);
    setLocal(next);
  }, []);

  /** Send this device's copy to the data server and take back the combined copy. */
  const pushSync = useCallback(
    async (state: UserState, { quiet = false } = {}) => {
      try {
        const r = await api.sync(state);
        commit({ state: r.state, pendingSync: false });
        setSync("synced");
        return true;
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 409) {
          setSync("device-only"); // not signed in, or sync not set up: device copy only
          commit({ state, pendingSync: false });
          return false;
        }
        // data server (or network) unavailable: keep it here and try again next time (AC-6.6)
        commit({ state, pendingSync: true });
        setSync("pending");
        if (!quiet) setNotice(SYNC_LATER);
        return false;
      }
    },
    [commit],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      api.sections().then((s) => alive && s.length && setSections(s)).catch(() => undefined);
      const synced = await pushSync(latest.current.state, { quiet: true });
      if (!synced) {
        // Apply the full expiry and replacement rules without the data server.
        try {
          const r = await api.merge(latest.current.state.cards, []);
          if (alive) commit({ ...latest.current, state: { ...latest.current.state, cards: r.cards } });
        } catch {
          /* offline: the quick on-device expiry already ran */
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [pushSync, commit]);

  const saveTopics = useCallback(
    async (secs: string[], keywords: string[]) => {
      if (secs.length === 0) return false; // AC-1.3: nothing is saved
      const state = { ...latest.current.state, topics: { sections: secs, keywords, updated_at: nowIso() } };
      commit({ state, pendingSync: true });
      await pushSync(state, { quiet: true });
      return true;
    },
    [commit, pushSync],
  );

  const toggleSave = useCallback(
    async (id: string) => {
      const cards = latest.current.state.cards.map((c) =>
        c.id === id ? { ...c, saved: !c.saved, saved_changed_at: nowIso() } : c,
      );
      const state = { ...latest.current.state, cards };
      commit({ state, pendingSync: true });
      await pushSync(state);
    },
    [commit, pushSync],
  );

  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    const { topics, cards } = latest.current.state;
    if (topics.sections.length === 0) return;
    running.current = true;
    setPhase({ kind: "fetching" });
    const outcome: RefreshOutcome = { aiStatus: null, failedSources: [], error: null, added: 0 };
    try {
      const got = await api.refresh({ sections: topics.sections, keywords: topics.keywords, known_urls: cards.map((c) => c.source_url) });
      outcome.failedSources = got.failed_sources;
      const fresh: Card[] = [];
      const statuses = new Set<AiStatus>();
      for (let i = 0; i < got.articles.length; i++) {
        setPhase({ kind: "summarising", done: i + 1, total: got.articles.length });
        try {
          const r = await api.curate({ article: got.articles[i], sections: topics.sections, keywords: topics.keywords });
          statuses.add(r.ai_status);
          if (r.card) fresh.push(r.card);
        } catch {
          statuses.add("error");
        }
      }
      outcome.aiStatus = (["offline", "not_configured", "error"] as AiStatus[]).find((s) => statuses.has(s)) ?? (statuses.size ? "ok" : null);
      outcome.added = fresh.length;
      let merged: Card[];
      try {
        merged = (await api.merge(latest.current.state.cards, fresh)).cards;
      } catch {
        merged = dropExpired([...fresh, ...latest.current.state.cards]);
      }
      const state = { ...latest.current.state, cards: merged, settings: { ...latest.current.state.settings, last_refreshed_at: nowIso() } };
      commit({ state, pendingSync: true });
      await pushSync(state, { quiet: true });
    } catch (e) {
      outcome.error = (e as Error).message || "The refresh didn't finish. Try again in a moment.";
    } finally {
      running.current = false;
      setPhase({ kind: "idle" });
      setLastOutcome(outcome);
    }
  }, [commit, pushSync]);

  const value = useMemo<Ctx>(
    () => ({
      state: local.state, sections, sync, notice, phase, lastOutcome, ready,
      saveTopics, toggleSave, refresh, dismissNotice: () => setNotice(null),
    }),
    [local.state, sections, sync, notice, phase, lastOutcome, ready, saveTopics, toggleSave, refresh],
  );
  return <DistillContext.Provider value={value}>{children}</DistillContext.Provider>;
}

export function sectionLabel(id: string, sections: Section[]): string {
  if (id.startsWith("kw:")) return `“${id.slice(3)}”`;
  return sections.find((s) => s.id === id)?.name ?? id;
}
