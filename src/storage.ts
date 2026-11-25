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
