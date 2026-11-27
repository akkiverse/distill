import type { AdminSources, AiStatus, Article, Card, DetailAnswer, Instrument, PersonSource, PricesResult, Section, UserState } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(0, "network", "Distill can't reach its server. Check your connection.");
  }
  if (!r.ok) {
    let code = "http_error";
    let message = `The server answered ${r.status}.`;
    try {
      const j = await r.json();
      code = j?.error?.code ?? code;
      message = j?.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(r.status, code, message);
  }
  return (await r.json()) as T;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  sections: () => call<Section[]>("/api/sections"),
  refresh: (body: { sections: string[]; keywords: string[]; known_urls: string[]; sources_off?: string[] }) =>
    post<{ articles: Article[]; failed_sources: string[]; fetched_at: string }>("/api/feed/refresh", body),
  curate: (body: { article: Article; sections: string[]; keywords: string[] }) =>
    post<{ card: Card | null; ai_status: AiStatus }>("/api/feed/curate", body),
  // US-13 (CR-0011): one story's detailed summary, read from its article on the server
  detail: (body: { url: string; title: string; source_name: string }) => post<DetailAnswer>("/api/feed/detail", body),
  merge: (cards: Card[], new_cards: Card[]) => post<{ cards: Card[] }>("/api/feed/merge", { cards, new_cards }),
  sync: (state: UserState) => call<{ state: UserState; synced_at: string }>("/api/me/state", { method: "PUT", body: JSON.stringify(state) }),
  aiStatus: () => call<{ configured?: boolean; online?: boolean }>("/api/ai/status"),
  me: () => call<{ signed_in: boolean; user?: { name: string; role?: string } }>("/auth/me"),
  // US-12 (CR-0010): news sources
  sources: () => call<{ sources: PersonSource[] }>("/api/sources"),
  adminSources: () => call<AdminSources>("/api/admin/sources"),
  addSource: (body: { name: string; url: string; sections: string[] }) => post<AdminSources>("/api/admin/sources", body),
  changeSource: (id: string, body: { name?: string; url?: string; sections?: string[]; paused?: boolean }) =>
    call<AdminSources>(`/api/admin/sources/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  removeSource: (id: string) => call<AdminSources>(`/api/admin/sources/${encodeURIComponent(id)}`, { method: "DELETE" }),
  checkSources: () => post<AdminSources>("/api/admin/sources/check", {}),
  marketSearch: (q: string, group = "") => call<Instrument[]>(`/api/market/search?q=${encodeURIComponent(q)}${group ? `&group=${group}` : ""}`),
  marketWatch: (keys: string[]) => post<{ watched: string[]; refused: string[] }>("/api/market/watch", { keys }),
  marketPrices: (keys: string[]) => call<PricesResult>(`/api/market/prices?keys=${keys.map(encodeURIComponent).join(",")}`),
};
