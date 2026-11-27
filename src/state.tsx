import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { dropExpired, loadLocal, loadSeen, MAX_KNOWN, rememberSeen, saveLocal, type Local } from "./storage";
import { nowIso } from "./time";
import { applyTheme, isTheme } from "./theme";
import type { AiStatus, Card, Section, StripSetting, SyncStatus, Theme, UserState } from "./types";
import { changedWatchlist } from "./watch";

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
  /** The newest word on the AI server: from the live status check or the latest refresh (null: not known). */
  aiOnline: boolean | null;
  ready: boolean;
  saveTopics: (sections: string[], keywords: string[]) => Promise<boolean>;
  /** US-9, US-10: the price watchlist, its pins and the strip setting, kept with topics in the account (AC-9.2, AC-9.11, AC-10.3, AC-10.11). */
  saveWatchlist: (change: { keys?: string[]; pinned?: string[]; strip?: StripSetting }) => Promise<void>;
  toggleSave: (id: string) => Promise<void>;
  /** AC-11.1, AC-11.3: the reader's theme, applied at once and kept with the account settings (newer choice wins). */
  setTheme: (theme: Theme) => Promise<void>;
  refresh: () => Promise<void>;
  dismissNotice: () => void;
}

const DistillContext = createContext<Ctx | null>(null);

export function useDistill(): Ctx {
  const c = useContext(DistillContext);
  if (!c) throw new Error("useDistill outside DistillProvider");
  return c;
}

/** Cards made while the AI was off (or failed) show the headline only; the next refresh tries them again. */
export const isHeadlineOnly = (c: Card) => c.ai_status !== "ok";

/** Put freshly curated cards in, keeping the first fetch time of a headline-only card they replace (AC-3.6). */
export function withFirstFetch(fresh: Card[], existing: Card[]): Card[] {
  const before = new Map(existing.map((c) => [c.id, c]));
  return fresh.map((c) => {
    const old = before.get(c.id);
    return old ? { ...c, fetched_at: old.fetched_at } : c;
  });
}

export const AI_STATUS_EVERY_MS = 60_000;

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
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);
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

  // AC-3.5: the offline note follows the live AI status check, not the cards already on screen.
  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .aiStatus()
        .then((j) => {
          if (!alive) return;
          if (j.configured === false) setAiOnline(null);
          else if (typeof j.online === "boolean") setAiOnline(j.online);
        })
        .catch(() => undefined); // signed out, route missing or a network blip: say nothing new
    void check();
    const timer = setInterval(check, AI_STATUS_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

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

  const saveWatchlist = useCallback(
    async (change: { keys?: string[]; pinned?: string[]; strip?: StripSetting }) => {
      const state = { ...latest.current.state, watchlist: changedWatchlist(latest.current.state.watchlist, change) };
      commit({ state, pendingSync: true });
      await pushSync(state, { quiet: true });
    },
    [commit, pushSync],
  );

  const setTheme = useCallback(
    async (theme: Theme) => {
      const settings = { ...latest.current.state.settings, theme, theme_changed_at: nowIso() };
      const state = { ...latest.current.state, settings };
      applyTheme(theme);
      commit({ state, pendingSync: true });
      await pushSync(state, { quiet: true });
    },
    [commit, pushSync],
  );

  // AC-11.1: whatever the device copy or the account says, the page shows it (also after a sync brings another device's choice).
  const theme = isTheme(local.state.settings.theme) ? local.state.settings.theme : "system";
  useEffect(() => applyTheme(theme), [theme]);

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
      // AC-3.6: headline-only cards are not "known", so this refresh can bring their AI summaries.
      // AC-8.5: stories the AI already judged on this device (kept, dropped or replaced since) are known too.
      const known = [...new Set([...cards.filter((c) => !isHeadlineOnly(c)).map((c) => c.source_url), ...Object.keys(loadSeen())])].slice(0, MAX_KNOWN);
      const got = await api.refresh({ sections: topics.sections, keywords: topics.keywords, known_urls: known });
      outcome.failedSources = got.failed_sources;
      const fresh: Card[] = [];
      const statuses = new Set<AiStatus>();
      for (let i = 0; i < got.articles.length; i++) {
        setPhase({ kind: "summarising", done: i + 1, total: got.articles.length });
        try {
          const r = await api.curate({ article: got.articles[i], sections: topics.sections, keywords: topics.keywords });
          statuses.add(r.ai_status);
          if (r.ai_status === "ok") rememberSeen([got.articles[i].url]); // judged by the AI: never sent again (AC-8.5)
          if (r.card) fresh.push(r.card);
        } catch {
          statuses.add("error");
        }
      }
      outcome.aiStatus = (["offline", "not_configured", "error"] as AiStatus[]).find((s) => statuses.has(s)) ?? (statuses.size ? "ok" : null);
      if (outcome.aiStatus === "offline") setAiOnline(false);
      else if (outcome.aiStatus === "ok") setAiOnline(true);
      const existing = latest.current.state.cards;
      const fresh2 = withFirstFetch(fresh, existing);
      outcome.added = fresh2.filter((c) => !existing.some((e) => e.id === c.id)).length;
      let merged: Card[];
      try {
        merged = (await api.merge(existing, fresh2)).cards;
      } catch {
        merged = dropExpired(localMerge(existing, fresh2));
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
      state: local.state, sections, sync, notice, phase, lastOutcome, aiOnline, ready,
      saveTopics, saveWatchlist, toggleSave, setTheme, refresh, dismissNotice: () => setNotice(null),
    }),
    [local.state, sections, sync, notice, phase, lastOutcome, aiOnline, ready, saveTopics, saveWatchlist, toggleSave, setTheme, refresh],
  );
  return <DistillContext.Provider value={value}>{children}</DistillContext.Provider>;
}

/** Without the server's merge: one card per id, an AI summary beats a headline-only copy, then the saved choice made last wins. */
export function localMerge(existing: Card[], fresh: Card[]): Card[] {
  const byId = new Map<string, Card>();
  for (const c of [...existing, ...fresh]) {
    const old = byId.get(c.id);
    if (!old) {
      byId.set(c.id, c);
      continue;
    }
    const base = isHeadlineOnly(old) !== isHeadlineOnly(c) ? (isHeadlineOnly(c) ? old : c) : Date.parse(c.fetched_at) >= Date.parse(old.fetched_at) ? c : old;
    const when = (x: Card) => (x.saved_changed_at ? Date.parse(x.saved_changed_at) : -Infinity);
    const flag = when(c) > when(old) ? c : old;
    const replaced = [old.replaced_at, c.replaced_at].filter(Boolean).sort().at(-1) ?? null;
    byId.set(c.id, { ...base, saved: flag.saved, saved_changed_at: flag.saved_changed_at, ...(replaced ? { replaced_at: replaced } : {}) });
  }
  return [...byId.values()];
}

export function sectionLabel(id: string, sections: Section[]): string {
  if (id.startsWith("kw:")) return `“${id.slice(3)}”`;
  return sections.find((s) => s.id === id)?.name ?? id;
}
