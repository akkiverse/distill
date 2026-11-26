import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { localMerge } from "../state";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

const topics = { sections: ["finance"], keywords: [], updated_at: iso(H) };
const recent = { last_refreshed_at: iso(5 * 60_000), theme: "system" as const }; // no refresh on open
const due = { last_refreshed_at: iso(4 * H), theme: "system" as const }; // refresh on open
const headlineOnly = (id: string, over = {}) => card(id, { summary: "", key_points: [], ai_status: "offline", ...over });

describe("CR-0003: the AI offline note and headline-only cards after the AI is back", () => {
  it("AC-3.5: cards made while the AI was off don't keep the offline note once the live check says online", async () => {
    const server = fakeServer(deviceOnly); // GET /api/ai/status: online
    seed({ topics, settings: recent, cards: [headlineOnly("a1", { title: "Sensex closes higher" }), headlineOnly("a2", { title: "Gold steady" })] });
    renderApp();
    expect(await screen.findByText("Sensex closes higher")).toBeInTheDocument();
    await waitFor(() => expect(server.calls.some((c) => c.path === "/api/ai/status")).toBe(true));
    expect(screen.queryByText(/AI is offline right now/)).toBeNull();
  });

  it("AC-3.5: the note shows when the live check says the AI is offline", async () => {
    fakeServer({ ...deviceOnly, "GET /api/ai/status": () => ({ json: { configured: true, online: false } }) });
    seed({ topics, settings: recent, cards: [card("b1", { title: "Bank results" })] });
    renderApp();
    expect(await screen.findByText(/AI is offline right now\. You'll see headlines only/)).toBeInTheDocument();
  });

  it("AC-3.6: the next refresh sends headline-only stories again and their AI summaries replace them", async () => {
    const firstFetch = iso(4 * H);
    const article = { id: "h1", title: "Rupee ends flat", snippet: "", url: "https://news.example.com/h1", source_name: "Mint", published_at: iso(5 * H), section: "finance", via: "rss" };
    const server = fakeServer({
      ...deviceOnly,
      "POST /api/feed/merge": (b) => ({ json: { cards: localMerge(b.cards, b.new_cards) } }),
      "POST /api/feed/refresh": () => ({ json: { articles: [article], failed_sources: [], fetched_at: "now" } }),
      "POST /api/feed/curate": () => ({ json: { card: card("h1", { title: "Rupee ends flat", summary: "The rupee closed flat against the dollar.", fetched_at: iso(0) }), ai_status: "ok" } }),
    });
    seed({ topics, settings: due, cards: [
      headlineOnly("h1", { title: "Rupee ends flat", fetched_at: firstFetch, saved: true, saved_changed_at: firstFetch }),
      card("k1", { title: "Already summarised" }),
    ] });
    renderApp();
    expect(await screen.findByText("The rupee closed flat against the dollar.")).toBeInTheDocument();
    const sent = server.calls.find((c) => c.path === "/api/feed/refresh")!;
    expect(sent.body.known_urls).toEqual(["https://news.example.com/k1"]);
    const cards = await screen.findAllByTestId("card");
    expect(cards).toHaveLength(2);
    const rupee = cards.find((c) => c.textContent?.includes("Rupee ends flat"))!;
    expect(within(rupee).getByText("AI summary")).toBeInTheDocument();
    expect(screen.queryByText(/AI is offline right now/)).toBeNull();
    const saved = JSON.parse(localStorage.getItem("distill.v1")!).state.cards.find((c: { id: string }) => c.id === "h1");
    expect(saved).toMatchObject({ ai_status: "ok", saved: true, fetched_at: firstFetch });
  });

  it("AC-3.6: without the server's merge, the device keeps one card per story and prefers the AI summary", async () => {
    const article = { id: "h2", title: "Oil prices dip", snippet: "", url: "https://news.example.com/h2", source_name: "Mint", published_at: iso(5 * H), section: "finance", via: "rss" };
    fakeServer({
      ...deviceOnly,
      "POST /api/feed/merge": () => ({ status: 503, json: { error: { code: "unavailable", message: "down" } } }),
      "POST /api/feed/refresh": () => ({ json: { articles: [article], failed_sources: [], fetched_at: "now" } }),
      "POST /api/feed/curate": () => ({ json: { card: card("h2", { title: "Oil prices dip", summary: "Brent fell 1%.", fetched_at: iso(0) }), ai_status: "ok" } }),
    });
    seed({ topics, settings: due, cards: [headlineOnly("h2", { title: "Oil prices dip", fetched_at: iso(4 * H) })] });
    renderApp();
    expect(await screen.findByText("Brent fell 1%.")).toBeInTheDocument();
    expect(await screen.findAllByTestId("card")).toHaveLength(1);
  });
});
