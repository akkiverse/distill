import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feedOrder } from "../screens/Feed";
import { clock, publishedLabel } from "../time";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

const MIN = 60_000;
const topics = { sections: ["finance"], keywords: [], updated_at: iso(H) };
const settingsAt = (msAgo: number) => ({ last_refreshed_at: iso(msAgo), theme: "system" as const });
const refreshes = (calls: { path: string }[]) => calls.filter((c) => c.path === "/api/feed/refresh").length;
const noArticles = { "POST /api/feed/refresh": () => ({ json: { articles: [], failed_sources: [], fetched_at: "now" } }) };

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
const setScroll = (y: number) => Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: y });

afterEach(() => {
  vi.useRealTimers();
  visibility = "visible";
  setScroll(0);
});

const article = (id: string, title: string) => ({ id, title, snippet: "", url: `https://news.example.com/${id}`, source_name: "Mint", published_at: iso(0), section: "finance", via: "rss" });

describe("US-8: Published times and a feed that stays fresh (CR-0004)", () => {
  it("AC-8.1: the publish time is a full date and time in Indian time", () => {
    expect(publishedLabel("2026-11-26T03:44:00Z")).toBe("26 Nov 2026, 9:14 AM IST");
    expect(publishedLabel("2026-11-25T18:30:00Z")).toBe("26 Nov 2026, 12:00 AM IST"); // midnight in India, still the 25th in UTC
    expect(publishedLabel("2026-11-26T06:35:00Z")).toBe("26 Nov 2026, 12:05 PM IST");
    expect(publishedLabel("2026-11-26T09:14:00+05:30")).toBe("26 Nov 2026, 9:14 AM IST");
    expect(clock(Date.parse("2026-11-26T05:12:00Z"))).toBe("10:42 AM");
  });

  it("AC-8.1: each card and the post detail show the publish time next to the time ago", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("p1", { title: "RBI holds rates", published_at: iso(2 * H) })] });
    renderApp();
    const [c] = await screen.findAllByTestId("card");
    const label = publishedLabel(iso(2 * H));
    expect(within(c).getByText(label)).toBeInTheDocument();
    expect(within(c).getByText(label).tagName).toBe("TIME");
    expect(within(c).getByText("2 h ago")).toBeInTheDocument();
    window.location.hash = "#/post/p1";
    expect(await screen.findByRole("heading", { level: 1, name: "RBI holds rates" })).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("2 h ago")).toBeInTheDocument();
  });

  it("AC-8.2: a story with no publish time says \"Time not given by source\" instead of guessing", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("n1", { title: "No date story", published_at: null }), card("n2", { title: "Bad date story", published_at: "sometime" })] });
    renderApp();
    const cards = await screen.findAllByTestId("card");
    for (const c of cards) {
      expect(within(c).getByText("Time not given by source")).toBeInTheDocument();
      expect(within(c).queryByText(/IST/)).toBeNull();
    }
  });

  it("AC-8.3: cards are newest first by publish time, not by when they were fetched", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: settingsAt(5 * MIN), cards: [
      card("late-fetch", { title: "Published earlier", published_at: iso(6 * H), fetched_at: iso(10 * MIN) }),
      card("early-fetch", { title: "Published later", published_at: iso(H), fetched_at: iso(5 * H) }),
      card("no-date", { title: "No date, fetched 3 h ago", published_at: null, fetched_at: iso(3 * H) }),
    ] });
    renderApp();
    const titles = (await screen.findAllByTestId("card")).map((c) => c.querySelector(".card-link")!.textContent);
    expect(titles).toEqual(["Published later", "No date, fetched 3 h ago", "Published earlier"]);
    expect(feedOrder([card("x", { published_at: iso(H) }), card("y", { published_at: iso(0) })]).map((c) => c.id)).toEqual(["y", "x"]);
  });

  it("AC-8.4: while the Feed is open and visible it refreshes by itself every 15 minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeServer({ ...deviceOnly, ...noArticles });
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("a")] });
    renderApp();
    await screen.findByTestId("up-to-date");
    await act(() => vi.advanceTimersByTimeAsync(9 * MIN)); // 14 minutes since the last refresh
    expect(refreshes(server.calls)).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1.5 * MIN)); // past 15 minutes
    await waitFor(() => expect(refreshes(server.calls)).toBe(1));
    await act(() => vi.advanceTimersByTimeAsync(10 * MIN));
    expect(refreshes(server.calls)).toBe(1); // the next one waits another 15 minutes
    await act(() => vi.advanceTimersByTimeAsync(6 * MIN));
    await waitFor(() => expect(refreshes(server.calls)).toBe(2));
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled(); // the manual button stays
  });

  it("AC-8.4: no refresh while the app is in the background; one on coming back after 15 minutes or more", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeServer({ ...deviceOnly, ...noArticles });
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("a")] });
    renderApp();
    await screen.findByTestId("up-to-date");
    visibility = "hidden";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(40 * MIN));
    expect(refreshes(server.calls)).toBe(0);
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(refreshes(server.calls)).toBe(1));
  });

  it("AC-8.4: coming back before 15 minutes have passed doesn't refresh", async () => {
    const server = fakeServer({ ...deviceOnly, ...noArticles });
    seed({ topics, settings: settingsAt(10 * MIN), cards: [card("a")] });
    renderApp();
    await screen.findByTestId("up-to-date");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    act(() => void window.dispatchEvent(new Event("focus")));
    await new Promise((r) => setTimeout(r, 30));
    expect(refreshes(server.calls)).toBe(0);
  });

  it("AC-8.5: stories the AI already judged are sent as known, so they don't go to the AI again", async () => {
    const dropped = article("d1", "Bank holiday list");
    const offline = article("o1", "Markets open flat");
    let round = 0;
    const server = fakeServer({
      ...deviceOnly,
      "POST /api/feed/refresh": () => ({ json: { articles: round++ === 0 ? [dropped, offline] : [], failed_sources: [], fetched_at: "now" } }),
      "POST /api/feed/curate": (b) => (b.article.id === "d1"
        ? { json: { card: null, ai_status: "ok" } } // judged not useful: no card
        : { json: { card: card("o1", { title: "Markets open flat", summary: "", key_points: [], ai_status: "offline" }), ai_status: "offline" } }),
    });
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("k1", { title: "Kept story" })] });
    renderApp();
    await screen.findByTestId("up-to-date");
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await screen.findByText("Markets open flat");
    await waitFor(() => expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() => expect(refreshes(server.calls)).toBe(2));
    const second = server.calls.filter((c) => c.path === "/api/feed/refresh")[1];
    expect(second.body.known_urls).toEqual(expect.arrayContaining(["https://news.example.com/k1", "https://news.example.com/d1"]));
    expect(second.body.known_urls).not.toContain("https://news.example.com/o1"); // headline-only: tried again once the AI is back (AC-3.6)
  });

  it("AC-8.6: a card that replaced an older report shows \"Updated <time>\"", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: settingsAt(5 * MIN), cards: [
      card("g2", { title: "Gold rate today: 24K at 76,900", published_at: iso(10 * MIN), replaced_at: "2026-11-26T05:12:00Z" }),
      card("plain", { title: "Plain story", published_at: iso(H) }),
    ] });
    renderApp();
    const [updated, plain] = await screen.findAllByTestId("card");
    expect(within(updated).getByText("Updated 10:42 AM")).toBeInTheDocument();
    expect(within(plain).queryByText(/Updated/)).toBeNull();
  });

  it("AC-8.7: new cards arriving while I'm scrolled down wait above with a \"1 new\" pill; nothing on screen moves", async () => {
    const server = fakeServer({
      ...deviceOnly,
      "POST /api/feed/merge": (b) => ({ json: { cards: [...b.new_cards, ...b.cards.filter((c: { id: string }) => !(b.new_cards.length && c.id === "g1"))] } }), // g2 replaces g1
      "POST /api/feed/refresh": () => ({ json: { articles: [article("g2", "Gold rate today: 24K at 76,900")], failed_sources: [], fetched_at: "now" } }),
      "POST /api/feed/curate": () => ({ json: { card: card("g2", { title: "Gold rate today: 24K at 76,900", published_at: iso(0), fetched_at: iso(0) }), ai_status: "ok" } }),
    });
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("g1", { title: "Gold rate today: 24K at 76,200", published_at: iso(2 * H) }), card("b", { title: "Second story", published_at: iso(3 * H) })] });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    renderApp();
    await screen.findByTestId("up-to-date");
    setScroll(600); // reading further down
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    const pill = await screen.findByRole("button", { name: "1 new" });
    await waitFor(() => expect(server.calls.some((c) => c.path === "/api/me/state" && c.body.cards.some((x: { id: string }) => x.id === "g2"))).toBe(true));
    const titles = () => screen.getAllByTestId("card").map((c) => c.querySelector(".card-link")!.textContent);
    expect(titles()).toEqual(["Gold rate today: 24K at 76,200", "Second story"]); // unchanged while reading
    fireEvent.click(pill);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(titles()).toEqual(["Gold rate today: 24K at 76,900", "Second story"]);
    expect(screen.queryByRole("button", { name: /new$/ })).toBeNull();
  });

  it("AC-8.7: at the top of the feed new cards appear straight away; scrolling back up shows waiting ones", async () => {
    let n = 0;
    fakeServer({
      ...deviceOnly,
      "POST /api/feed/refresh": () => ({ json: { articles: [article(`new${++n}`, `New story ${n}`)], failed_sources: [], fetched_at: "now" } }),
      "POST /api/feed/curate": (b) => ({ json: { card: card(b.article.id, { title: b.article.title, published_at: iso(0), fetched_at: iso(0) }), ai_status: "ok" } }),
    });
    seed({ topics, settings: settingsAt(5 * MIN), cards: [card("a", { title: "Older story" })] });
    renderApp();
    await screen.findByTestId("up-to-date");
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(await screen.findByText("New story 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new$/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled());
    setScroll(500);
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await screen.findByRole("button", { name: "1 new" });
    expect(screen.queryByText("New story 2")).toBeNull();
    setScroll(0);
    act(() => void window.dispatchEvent(new Event("scroll")));
    expect(await screen.findByText("New story 2")).toBeInTheDocument();
  });

  it("AC-8.8: the top of the Feed says \"Last updated <time>\"", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-26T05:20:00Z"));
    fakeServer(deviceOnly);
    seed({ topics, settings: { last_refreshed_at: "2026-11-26T05:12:00Z", theme: "system" }, cards: [card("a")] });
    renderApp();
    expect(await screen.findByText("Last updated 10:42 AM")).toBeInTheDocument();
    expect(screen.getByText("Next refresh after 10:57 AM")).toBeInTheDocument();
  });
});
