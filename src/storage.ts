import { EXPIRY_MS } from "./time";
import type { Card, UserState } from "./types";

const KEY = "distill.v1";

export const emptyState = (): UserState => ({
  version: 1,
  topics: { sections: [], keywords: [], updated_at: null },
  cards: [],
  settings: { last_refreshed_at: null, theme: "system" },
  updated_at: null,
});

export interface Local {
  state: UserState;
  pendingSync: boolean;
}

/** The device copy. Older or damaged copies are upgraded or replaced, never crash the app. */
export function loadLocal(): Local {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: emptyState(), pendingSync: false };
    const j = JSON.parse(raw);
    const base = emptyState();
    const state: UserState = {
      ...base,
      ...j.state,
      topics: { ...base.topics, ...(j.state?.topics ?? {}) },
      settings: { ...base.settings, ...(j.state?.settings ?? {}) },
      cards: Array.isArray(j.state?.cards) ? j.state.cards : [],
    };
    return { state, pendingSync: !!j.pendingSync };
  } catch {
    return { state: emptyState(), pendingSync: false };
  }
}

export function saveLocal(local: Local): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    /* storage full or blocked: the app still works for this visit */
  }
}

/**
 * Quick on-device expiry so old unsaved cards never show, even before the server answers
 * (AC-6.1). The server's /api/feed/merge applies the full rules (replacement as well).
 */
export function dropExpired(cards: Card[], now = Date.now()): Card[] {
  return cards.filter((c) => c.saved || now - Date.parse(c.fetched_at) <= EXPIRY_MS);
}

const SEEN_KEY = "distill.seen.v1";
export const SEEN_KEEP_MS = 36 * 3_600_000; // the server ignores stories older than 36 hours anyway
export const MAX_KNOWN = 500; // the refresh request accepts up to 500 known links

/**
 * Links the AI has already judged on this device (kept or not), with when (AC-8.5). Device-only and
 * separate from the synced copy, so the synced data shape is unchanged.
 */
export function loadSeen(now = Date.now()): Record<string, number> {
  try {
    const j = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    const out: Record<string, number> = {};
    for (const [url, at] of Object.entries(j ?? {})) if (typeof at === "number" && now - at <= SEEN_KEEP_MS) out[url] = at;
    return out;
  } catch {
    return {};
  }
}

export function rememberSeen(urls: string[], now = Date.now()): void {
  if (urls.length === 0) return;
  const seen = loadSeen(now);
  for (const u of urls) seen[u] = now;
  const newest = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, MAX_KNOWN);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    /* storage full or blocked: at worst a story is judged again */
  }
}
