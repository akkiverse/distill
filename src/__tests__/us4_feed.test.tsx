import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

const topics = { sections: ["finance"], keywords: [], updated_at: iso(H) };
const fresh = { last_refreshed_at: iso(H), theme: "system" as const };

describe("US-4: Card feed that ends", () => {
  it("AC-4.1: cards are newest first with source, time ago, \"AI summary\", summary and key points", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [card("older", { fetched_at: iso(5 * H), title: "Older story" }), card("newer", { fetched_at: iso(0.5 * H), title: "Newer story", source_name: "The Hindu" })] });
    renderApp();
    const cards = await screen.findAllByTestId("card");
    expect(cards[0]).toHaveTextContent("Newer story");
    expect(cards[1]).toHaveTextContent("Older story");
    const c = within(cards[0]);
    expect(c.getByText("The Hindu")).toBeInTheDocument();
    expect(c.getByText(/ago|just now/)).toBeInTheDocument();
    expect(c.getByText("AI summary")).toBeInTheDocument();
    expect(c.getByText("Summary of newer.")).toBeInTheDocument();
    expect(c.getByText("Point one")).toBeInTheDocument();
    expect(c.getByText("Point two")).toBeInTheDocument();
  });

  it("AC-4.2: two or more figures in the same unit show a chart; otherwise chips", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [
      card("chart", { fetched_at: iso(H), key_figures: [{ label: "Today", value: 76200, unit: "INR/10 g" }, { label: "Yesterday", value: 75075, unit: "INR/10 g" }] }),
      card("chips", { fetched_at: iso(2 * H), key_figures: [{ label: "Runs", value: 312, unit: "runs" }, { label: "Overs", value: 50, unit: "overs" }] }),
    ] });
    renderApp();
    const [withChart, withChips] = await screen.findAllByTestId("card");
    const chart = within(withChart).getByTestId("chart");
    expect(within(chart).getByRole("img")).toHaveAccessibleName(/Today: 76,200 INR\/10 g; Yesterday: 75,075 INR\/10 g/);
    expect(within(withChips).queryByTestId("chart")).toBeNull();
    expect(within(withChips).getByRole("list", { name: "Key figures" })).toHaveTextContent("312 runs");
  });

  it("AC-4.3: \"You're up to date\" appears below the last card and nothing more loads", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [card("a"), card("b", { fetched_at: iso(2 * H) })] });
    renderApp();
    const end = await screen.findByTestId("up-to-date");
    expect(end).toHaveTextContent("You're up to date");
    const cards = screen.getAllByTestId("card");
    expect(cards.at(-1)!.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /load more|more/i })).toBeNull();
  });

  it("AC-4.4: with no topics saved the Feed says \"Choose your topics to start\" with a button to Topics", async () => {
    fakeServer(deviceOnly);
    renderApp();
    expect(await screen.findByRole("heading", { name: "Choose your topics to start" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose topics" })).toHaveAttribute("href", "#/topics");
  });

  it("AC-4.5: a refresh starts by itself when the last one was more than 3 hours ago", async () => {
    const server = fakeServer({ ...deviceOnly, "POST /api/feed/refresh": () => ({ json: { articles: [], failed_sources: [], fetched_at: "now" } }) });
    seed({ topics, settings: { last_refreshed_at: iso(3.2 * H), theme: "system" } });
    renderApp();
    await waitFor(() => expect(server.calls.some((c) => c.path === "/api/feed/refresh")).toBe(true));
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeInTheDocument();
  });

  it("AC-4.5: no automatic refresh when the last one was 3 hours ago or less; Refresh is still there", async () => {
    const server = fakeServer({ ...deviceOnly, "POST /api/feed/refresh": () => ({ json: { articles: [], failed_sources: [], fetched_at: "now" } }) });
    seed({ topics, settings: { last_refreshed_at: iso(2.9 * H), theme: "system" }, cards: [card("a")] });
    renderApp();
    await screen.findByTestId("up-to-date");
    await new Promise((r) => setTimeout(r, 50));
    expect(server.calls.some((c) => c.path === "/api/feed/refresh")).toBe(false);
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled();
  });

  it("AC-3.4: with AI offline the Feed shows \"AI is offline right now\" and headline-only cards", async () => {
    const article = { id: "x1", title: "Monsoon session ends", snippet: "", url: "https://n.example/x1", source_name: "Mint", published_at: iso(H), section: "finance", via: "rss" };
    fakeServer({
      ...deviceOnly,
      "POST /api/feed/refresh": () => ({ json: { articles: [article], failed_sources: ["Broken Feed"], fetched_at: "now" } }),
      "POST /api/feed/curate": () => ({ json: { card: card("x1", { title: "Monsoon session ends", summary: "", key_points: [], ai_status: "offline" }), ai_status: "offline" } }),
    });
    seed({ topics });
    renderApp();
    expect(await screen.findByText(/AI is offline right now/)).toBeInTheDocument();
    const [c] = await screen.findAllByTestId("card");
    expect(c).toHaveTextContent("Monsoon session ends");
    expect(within(c).queryByText("AI summary")).toBeNull();
    expect(screen.getByText(/Couldn't reach Broken Feed/)).toBeInTheDocument();
  });
});
