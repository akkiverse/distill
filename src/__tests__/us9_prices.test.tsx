import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOSED_EVERY_MS, OPEN_EVERY_MS, cardsMentioning, changeText, isOpen, money, quietBecauseClosed, refreshEvery } from "../markets";
import { loadLocal } from "../storage";
import { priceTime } from "../time";
import type { PriceItem, PricesResult } from "../types";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

afterEach(() => {
  vi.useRealTimers();
  visibility = "visible";
  localStorage.clear();
});

const item = (key: string, over: Partial<PriceItem> = {}): PriceItem => ({
  key, symbol: key.split(":")[1], name: key, exchange: key.split(":")[0], type: "stock", currency: "INR", source: "kite",
  status: "ok", price: 4182.5, prev_close: 4172.5, change: 10, change_pct: 0.24, as_of: "2026-11-26T09:11:00Z",
  label: "Live", market_state: "open", error: null, ...over,
});
const TCS = item("NSE:TCS", { name: "Tata Consultancy Services", symbol: "TCS" });
const EPAM = item("US:EPAM", {
  name: "EPAM Systems", symbol: "EPAM", currency: "USD", source: "finnhub", price: 185.2, change: -4.8, change_pct: -2.53, label: "Delayed 15 min",
});
const GOLD = item("GOLD:XAU_USD", { name: "Gold spot", symbol: "XAU", exchange: "SPOT", currency: "USD", source: "metalcharts", price: 2650, label: "Market closed, last close", market_state: "closed" });

const result = (items: PriceItem[], over: Partial<PricesResult> = {}): PricesResult => ({
  items, hidden: [], gateway: { heartbeat_at: new Date().toISOString(), paused: false }, read_at: new Date().toISOString(), ...over,
});
const watchlist = (keys: string[]) => ({ keys, updated_at: iso(H) });
const priceServer = (r: () => { status?: number; json: unknown }, extra = {}) =>
  fakeServer({ ...deviceOnly, "GET /api/market/prices": r, "POST /api/market/watch": (b) => ({ json: { watched: b.keys, refused: [] } }), ...extra });
const reads = (calls: { method: string; path: string }[]) => calls.filter((c) => c.path === "/api/market/prices").length;

describe("US-9: Price watchlist (CR-0005)", () => {
  it("AC-9.1: search lists matches with name, symbol and exchange, and adds one", async () => {
    const { calls } = priceServer(() => ({ json: result([]) }), {
      "GET /api/market/search": () => ({ json: [{ key: "NSE:TCS", symbol: "TCS", exchange: "NSE", name: "Tata Consultancy Services", type: "stock", currency: "INR", source: "kite" }] }),
    });
    renderApp("#/prices");
    fireEvent.change(await screen.findByLabelText("Add an item"), { target: { value: "tcs" } });
    const hits = await screen.findByRole("list", { name: "Search results" }, { timeout: 2000 });
    expect(within(hits).getByText("TCS")).toBeInTheDocument();
    expect(within(hits).getByText(/Tata Consultancy Services · NSE/)).toBeInTheDocument();
    fireEvent.click(within(hits).getByRole("button", { name: "Add Tata Consultancy Services" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:TCS"]));
    expect(calls.find((c) => c.path === "/api/market/search")).toBeTruthy();
  });

  it("AC-9.2: the watchlist is saved with the account copy, and an 11th item is refused", async () => {
    const keys = Array.from({ length: 10 }, (_, n) => `US:A${n}`);
    const { calls } = priceServer(() => ({ json: result(keys.map((k) => item(k, { currency: "USD", source: "finnhub" }))) }), {
      "GET /api/market/search": () => ({ json: [{ key: "US:EXTRA", symbol: "EXTRA", exchange: "US", name: "Extra Corp", type: "stock", currency: "USD", source: "finnhub" }] }),
    });
    seed({ watchlist: watchlist(keys) });
    renderApp("#/prices");
    fireEvent.change(await screen.findByLabelText("Add an item"), { target: { value: "extra" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Extra Corp" }, { timeout: 2000 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can watch up to 10 items");
    expect(loadLocal().state.watchlist?.keys).toEqual(keys);
    const sync = calls.filter((c) => c.method === "PUT" && c.path === "/api/me/state").at(-1);
    expect(sync?.body.watchlist.keys).toEqual(keys);
  });

  it("AC-9.3: opening the watchlist tells the gateway its keys are wanted", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS, EPAM]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/prices");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/market/watch")).toBe(true));
    expect(calls.find((c) => c.path === "/api/market/watch")?.body).toEqual({ keys: ["NSE:TCS", "US:EPAM"] });
  });

  it("AC-9.4: price with currency, change in green or red, and the time in Indian time", async () => {
    priceServer(() => ({ json: result([TCS, EPAM]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/prices");
    const [tcs, epam] = await screen.findAllByTestId("price-row");
    expect(within(tcs).getByText("Tata Consultancy Services")).toBeInTheDocument();
    expect(within(tcs).getByText("Rs 4,182.50")).toBeInTheDocument();
    expect(within(tcs).getByText("+10.00 (+0.24%)")).toHaveClass("up");
    expect(within(tcs).getByText("26 Nov, 2:41 PM IST").tagName).toBe("TIME");
    expect(within(epam).getByText("$185.20")).toBeInTheDocument();
    expect(within(epam).getByText("-4.80 (-2.53%)")).toHaveClass("down");
    expect(money(123456.5, "INR")).toBe("Rs 1,23,456.50");
    expect(changeText(0, 0)).toBe("0.00 (0.00%)");
    expect(priceTime("2026-11-26T09:11:00Z")).toBe("26 Nov, 2:41 PM IST");
  });

  it("AC-9.5: each price carries its Live, Delayed or Market closed label", async () => {
    priceServer(() => ({ json: result([TCS, EPAM, GOLD]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"]) });
    renderApp("#/prices");
    const rows = await screen.findAllByTestId("price-row");
    expect(within(rows[0]).getByText("Live")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Delayed 15 min")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Market closed, last close")).toBeInTheDocument();
  });

  it("AC-9.6: a gateway quiet for over 2 minutes shows Prices paused, with the last prices", async () => {
    priceServer(() => ({ json: result([TCS], { gateway: { heartbeat_at: "2026-11-26T09:05:00Z", paused: true } }) }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/prices");
    expect(await screen.findByText("Prices paused since 26 Nov, 2:35 PM IST")).toBeInTheDocument();
    expect(screen.getByText("Rs 4,182.50")).toBeInTheDocument();
  });

  it("AC-9.15: a quiet gateway while every watched market is closed says Markets closed, prices from the last close", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-28T06:00:00Z") }); // Saturday
    const closed = [item("NSE:TCS", { label: "Market closed, last close", market_state: "closed" }), { ...GOLD }];
    priceServer(() => ({ json: result(closed, { gateway: { heartbeat_at: "2026-11-27T10:05:00Z", paused: true, markets_closed: true } }) }));
    seed({ watchlist: watchlist(["NSE:TCS", "GOLD:XAU_USD"]) });
    renderApp("#/prices");
    expect(await screen.findByText("Markets closed, prices from the last close")).toBeInTheDocument();
    expect(screen.queryByText(/Prices paused/)).not.toBeInTheDocument();
    expect(screen.getByText("Rs 4,182.50")).toBeInTheDocument();
  });

  it("AC-9.15: a quiet gateway while a watched market is open still says Prices paused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-26T05:00:00Z") }); // Thursday 10:30 AM IST: NSE open
    const closed = [item("NSE:TCS", { label: "Market closed, last close", market_state: "closed" })];
    priceServer(() => ({ json: result(closed, { gateway: { heartbeat_at: "2026-11-25T10:05:00Z", paused: true, markets_closed: true } }) }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/prices");
    expect(await screen.findByText("Prices paused since 25 Nov, 3:35 PM IST")).toBeInTheDocument();
    expect(screen.queryByText("Markets closed, prices from the last close")).not.toBeInTheDocument();
  });

  it("AC-9.15: the clock rule: closed only when no watched market is open", () => {
    const sat = Date.parse("2026-11-28T06:00:00Z");
    const thuNight = Date.parse("2026-11-26T18:00:00Z"); // 11:30 PM IST, 1 PM New York: US open
    expect(quietBecauseClosed(["NSE:TCS"], true, sat)).toBe(true);
    expect(quietBecauseClosed(["NSE:TCS"], false, sat)).toBe(false);
    expect(quietBecauseClosed(["NSE:TCS", "US:EPAM"], true, thuNight)).toBe(false);
    expect(quietBecauseClosed([], true, sat)).toBe(false);
  });

  it("AC-9.7: no price yet says Waiting for the first price; an error keeps the last price", async () => {
    priceServer(() => ({ json: result([item("NSE:GOLDBEES", { status: "waiting", price: null, change: null, change_pct: null, as_of: null }), item("NSE:TCS", { status: "error", error: "Not logged in today" })]) }));
    seed({ watchlist: watchlist(["NSE:GOLDBEES", "NSE:TCS"]) });
    renderApp("#/prices");
    const [bees, tcs] = await screen.findAllByTestId("price-row");
    expect(within(bees).getByText("Waiting for the first price")).toBeInTheDocument();
    expect(within(tcs).getByText("Rs 4,182.50")).toBeInTheDocument();
    expect(within(tcs).getByText("Not logged in today")).toBeInTheDocument();
  });

  it("AC-9.8: items the server hides are not shown", async () => {
    priceServer(() => ({ json: result([EPAM], { hidden: ["NSE:TCS"] }) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/prices");
    const rows = await screen.findAllByTestId("price-row");
    await waitFor(() => expect(screen.getAllByTestId("price-row")).toHaveLength(1));
    expect(within(rows.at(-1)!).getByText("EPAM Systems")).toBeInTheDocument();
    expect(screen.queryByText("NSE:TCS")).toBeNull();
  });

  it("AC-9.9: market hours decide the pace: 30 seconds while any market is open, 15 minutes otherwise", () => {
    const at = (s: string) => Date.parse(s);
    expect(isOpen("india", at("2026-11-26T03:45:00Z"))).toBe(true); // 9:15 AM IST Thursday
    expect(isOpen("india", at("2026-11-26T03:44:00Z"))).toBe(false); // 9:14 AM
    expect(isOpen("india", at("2026-11-26T10:00:00Z"))).toBe(false); // 3:30 PM: closed
    expect(isOpen("india", at("2026-11-28T05:00:00Z"))).toBe(false); // Saturday
    expect(isOpen("us", at("2026-11-26T14:30:00Z"))).toBe(true); // 9:30 AM New York (winter, UTC-5)
    expect(isOpen("us", at("2026-07-01T13:30:00Z"))).toBe(true); // 9:30 AM New York (summer, UTC-4)
    expect(isOpen("us", at("2026-11-26T21:00:00Z"))).toBe(false); // 4 PM New York
    expect(isOpen("spot", at("2026-11-27T15:30:00Z"))).toBe(true); // Friday 9 PM in India: a weekday
    expect(isOpen("spot", at("2026-11-29T05:00:00Z"))).toBe(false); // Sunday
    expect(refreshEvery(["NSE:TCS", "US:EPAM"], at("2026-11-26T05:00:00Z"))).toBe(OPEN_EVERY_MS);
    expect(refreshEvery(["NSE:TCS", "US:EPAM"], at("2026-11-26T12:00:00Z"))).toBe(CLOSED_EVERY_MS); // between the two
  });

  it("AC-9.9: one read for all items, again after 30 seconds in market hours, and none in the background", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-26T05:00:00Z") });
    const { calls } = priceServer(() => ({ json: result([TCS, EPAM]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/prices");
    await waitFor(() => expect(reads(calls)).toBe(1));
    expect(calls.filter((c) => c.path === "/api/market/prices")).toHaveLength(1); // one request for both
    await act(async () => { await vi.advanceTimersByTimeAsync(OPEN_EVERY_MS); });
    await waitFor(() => expect(reads(calls)).toBe(2));
    visibility = "hidden";
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * OPEN_EVERY_MS); });
    expect(reads(calls)).toBe(2);
  });

  it("AC-9.9: folded away on the Feed, the list is not read", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS]) }));
    localStorage.setItem("distill.prices.open", "0");
    seed({ watchlist: watchlist(["NSE:TCS"]), topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, settings: { last_refreshed_at: iso(60_000), theme: "system" } });
    renderApp("#/");
    expect(await screen.findByTestId("prices-fold")).not.toHaveAttribute("open");
    await new Promise((r) => setTimeout(r, 50));
    expect(reads(calls)).toBe(0);
  });

  it("AC-9.10: without a price source Prices says so and the rest of Distill works", async () => {
    priceServer(() => ({ status: 409, json: { error: { code: "market_not_set_up", message: "Price source not set up yet." } } }));
    seed({ watchlist: watchlist(["NSE:TCS"]), cards: [card("c1", { title: "Markets today" })], topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, settings: { last_refreshed_at: iso(60_000), theme: "system" } });
    renderApp("#/");
    expect(await screen.findByText(/Price source not set up yet/)).toBeInTheDocument();
    expect(screen.getByText("Markets today")).toBeInTheDocument();
  });

  it("AC-9.10: a price source that can't be reached says so plainly", async () => {
    priceServer(() => ({ status: 503, json: { error: { code: "market_offline", message: "Prices can't be reached right now." } } }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/prices");
    expect(await screen.findByText(/Prices can't be reached right now/)).toBeInTheDocument();
  });

  it("AC-9.11: remove and move up or down, kept in order", async () => {
    priceServer(() => ({ json: result([TCS, EPAM, GOLD]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"]) });
    renderApp("#/prices");
    fireEvent.click(await screen.findByRole("button", { name: "Move Gold spot up" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:TCS", "GOLD:XAU_USD", "US:EPAM"]));
    expect(screen.getByRole("button", { name: "Move Tata Consultancy Services up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove EPAM Systems" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:TCS", "GOLD:XAU_USD"]));
  });

  it("AC-9.12: tapping an item shows the news cards that mention it", async () => {
    priceServer(() => ({ json: result([TCS, EPAM]) }));
    seed({
      watchlist: watchlist(["NSE:TCS", "US:EPAM"]),
      cards: [card("a", { title: "TCS wins a large deal" }), card("b", { title: "Gold slips", summary: "Nothing about the IT firm." }), card("c", { title: "IT stocks", summary: "Tata Consultancy Services led gains." })],
    });
    renderApp("#/prices");
    const [tcs, epam] = await screen.findAllByTestId("price-row");
    fireEvent.click(within(tcs).getByRole("button", { expanded: false, name: /Tata Consultancy Services/ }));
    expect(within(tcs).getByRole("link", { name: "TCS wins a large deal" })).toBeInTheDocument();
    expect(within(tcs).getByRole("link", { name: "IT stocks" })).toBeInTheDocument();
    expect(within(tcs).queryByText("Gold slips")).toBeNull();
    fireEvent.click(within(epam).getByRole("button", { expanded: false, name: /EPAM Systems/ }));
    expect(within(epam).getByText("No news cards mention it right now.")).toBeInTheDocument();
    expect(cardsMentioning([card("x", { title: "BTCS rally" })], "TCS", "Tata Consultancy Services")).toHaveLength(0);
  });

  it("AC-9.14: the information-only note, and the MetalCharts credit when gold is shown", async () => {
    priceServer(() => ({ json: result([TCS, GOLD]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "GOLD:XAU_USD"]) });
    renderApp("#/prices");
    expect(await screen.findByText(/For information only. Not investment advice. Prices may be delayed./)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "MetalCharts" })).toHaveAttribute("href", "https://metalcharts.org");
  });

  it("CR-0005: a device copy saved by v0.3.0 (no watchlist) loads with an empty list", () => {
    seed({ topics: { sections: ["finance"], keywords: ["gold rate"], updated_at: iso(H) } });
    const raw = JSON.parse(localStorage.getItem("distill.v1")!);
    delete raw.state.watchlist;
    localStorage.setItem("distill.v1", JSON.stringify(raw));
    const got = loadLocal().state;
    expect(got.watchlist).toEqual({ keys: [], updated_at: null });
    expect(got.topics.keywords).toEqual(["gold rate"]);
  });
});
