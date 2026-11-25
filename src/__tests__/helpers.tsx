import { render } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "../App";
import type { Card, UserState } from "../types";

export const H = 3_600_000;
export const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

export function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id, topic_section: "finance", title: `Story ${id}`, source_name: "Mint", source_url: `https://news.example.com/${id}`,
    published_at: iso(H), fetched_at: iso(H), summary: `Summary of ${id}.`, key_points: ["Point one", "Point two"],
    key_figures: [], story_key: id, relevance: 0.9, saved: false, saved_changed_at: null, ai_status: "ok", ...over,
  };
}

export function seed(state: Partial<UserState>, pendingSync = false) {
  const full: UserState = {
    version: 1, topics: { sections: [], keywords: [], updated_at: null }, cards: [],
    settings: { last_refreshed_at: null, theme: "system" }, updated_at: null, ...state,
  };
  localStorage.setItem("distill.v1", JSON.stringify({ state: full, pendingSync }));
}

type Handler = (body: any, url: string) => { status?: number; json: unknown } | undefined;

/** A fake server: routes "METHOD /path" to a handler; unknown routes answer 404. Records every call. */
export function fakeServer(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: any }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const h = routes[`${method} ${path}`];
    const res = h ? h(body, url) : undefined;
    if (!res) return new Response(JSON.stringify({ error: { code: "not_found", message: "no route" } }), { status: 404 });
    return new Response(JSON.stringify(res.json), { status: res.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** Sync off (not signed in); merge echoes the rules' simplest case. */
export const deviceOnly: Record<string, Handler> = {
  "PUT /api/me/state": () => ({ status: 409, json: { error: { code: "sync_needs_signin", message: "Sign in to sync" } } }),
  "POST /api/feed/merge": (b) => ({ json: { cards: [...b.new_cards, ...b.cards] } }),
  "GET /auth/me": () => ({ json: { signed_in: false } }),
  "GET /api/ai/status": () => ({ json: { configured: true, online: true } }),
};

export function renderApp(hash = "#/") {
  window.location.hash = hash;
  return render(<App />);
}
