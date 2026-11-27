import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOSED_EVERY_MS, OPEN_EVERY_MS, cardsMentioning, changeText, isOpen, money, quietBecauseClosed, refreshEvery } from "../markets";
import { loadLocal } from "../storage";
import { priceTime } from "../time";
import { H, card, iso, renderApp, seed } from "./helpers";
import { EPAM, FRI_NSE_OPEN, GOLD, INFY, TCS, item, market, priceServer, reads, result, watchlist } from "./market_fixtures";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

afterEach(() => {
  vi.useRealTimers();
  visibility = "visible";
  localStorage.clear();
});

const row = (name: string) => screen.getAllByTestId("price-row").find((r) => within(r).queryByText(name))!;
const search = (hit: object) => ({ "GET /api/market/search": () => ({ json: [hit] }) });

// The Prices tab became the Watchlist in CR-0006 (US-10); these criteria still hold, some changed (noted per test).
describe("US-9: Price watchlist (CR-0005, changed CR-0006)", () => {
  it("AC-9.1: search lists matches with name, symbol and exchange, and adds one", async () => {
    const { calls } = priceServer(() => ({ json: result([]) }), search({ key: "NSE:TCS", symbol: "TCS", exchange: "NSE", name: "Tata Consultancy Services", type: "stock", currency: "INR", source: "kite", category: "stock", group: "india", display_name: "Tata Consultancy Services" }));
    renderApp("#/watchlist/add");
    fireEvent.change(await screen.findByLabelText("Search by name or symbol"), { target: { value: "tcs" } });
    const add = await screen.findByRole("button", { name: "Add Tata Consultancy Services" }, { timeout: 2000 });
    expect(screen.getByText("TCS · NSE")).toBeInTheDocument();
    fireEvent.click(add);
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:TCS"]));
    expect(calls.find((c) => c.path === "/api/market/search")).toBeTruthy();
  });

  it("AC-9.2 (changed CR-0006): the watchlist is saved with the account copy, and a 21st item is refused", async () => {
    const keys = Array.from({ length: 20 }, (_, n) => `US:A${n}`);
    const { calls } = priceServer(() => ({ json: result(keys.map((k) => item(k, { currency: "USD", source: "finnhub" }))) }),
      search({ key: "US:EXTRA", symbol: "EXTRA", exchange: "US", name: "Extra Corp", type: "stock", currency: "USD", source: "finnhub", group: "us" }));
    seed({ watchlist: watchlist(keys) });
    renderApp("#/watchlist/add");
    fireEvent.change(await screen.findByLabelText("Search by name or symbol"), { target: { value: "extra" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Extra Corp" }, { timeout: 2000 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can watch up to 20 items");
    const w = loadLocal().state.watchlist!;
    expect([...w.keys, ...(w.more ?? [])]).toEqual(keys);
    fireEvent.click(screen.getByRole("button", { name: "Pin US:A10" }));
    await waitFor(() => {
      const sync = calls.filter((c) => c.method === "PUT" && c.path === "/api/me/state").at(-1);
      expect(sync?.body.watchlist.keys).toEqual(keys.slice(0, 10));
      expect(sync?.body.watchlist.more).toEqual(keys.slice(10));
    });
  });

  it("AC-9.3: opening the watchlist tells the gateway its keys are wanted", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS, EPAM]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/watchlist");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/market/watch")).toBe(true));
    expect(calls.find((c) => c.path === "/api/market/watch")?.body).toEqual({ keys: ["NSE:TCS", "US:EPAM"] });
  });

  it("AC-9.4: price with currency, change in green or red, and the time in Indian time", async () => {
    priceServer(() => ({ json: result([TCS, EPAM]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    const tcs = row("Tata Consultancy Services");
    expect(within(tcs).getByText("₹4,182.50")).toBeInTheDocument();
    expect(within(tcs).getByText("+₹10.00 (+0.24%)").closest(".change")).toHaveClass("up"); // changed CR-0012: ₹ and an arrow
    expect(within(tcs).getByText("26 Nov, 2:41 PM IST").tagName).toBe("TIME");
    const epam = row("EPAM Systems");
    expect(within(epam).getByText("$185.20")).toBeInTheDocument();
    expect(within(epam).getByText("−4.80 (−2.53%)").closest(".change")).toHaveClass("down");
    expect(money(123456.5, "INR")).toBe("₹1,23,456.50");
    expect(changeText(0, 0)).toBe("0.00 (0.00%)");
    expect(priceTime("2026-11-26T09:11:00Z")).toBe("26 Nov, 2:41 PM IST");
  });

  it("AC-9.5: each price carries its Live, Delayed or Market closed label", async () => {
    priceServer(() => ({ json: result([TCS, EPAM, GOLD]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"]) });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    expect(within(row("Tata Consultancy Services")).getByText("Live")).toBeInTheDocument();
    expect(within(row("EPAM Systems")).getByText("Delayed 15 min")).toBeInTheDocument();
    expect(within(row("Gold spot")).getByText("Market closed, last close")).toBeInTheDocument();
  });

  it("AC-9.6 (changed CR-0006): a gateway quiet for over 2 minutes while NSE is open shows Prices paused, with the last prices", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-26T09:10:00Z") });
    priceServer(() => ({ json: result([TCS], { gateway: { heartbeat_at: "2026-11-26T09:05:00Z", paused: true }, markets: { NSE: market("NSE", "open") } }) }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist");
    expect(await screen.findByText("Prices paused since 2:35 PM IST while NSE is open. The last prices are shown.")).toBeInTheDocument();
    expect(screen.getAllByText("₹4,182.50").length).toBeGreaterThan(0);
  });

  it("AC-9.15: a quiet gateway while every watched market is closed says Markets closed, prices from the last close", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-28T06:00:00Z") }); // Saturday
    const closed = [item("NSE:TCS", { name: "Tata Consultancy Services", label: "Market closed, last close", market_state: "closed" }), { ...GOLD }];
    const markets = { NSE: market("NSE", "closed", "2026-11-30T03:45:00Z"), GOLD: market("GOLD", "closed", "2026-11-30T03:45:00Z", { source: "clock" }) };
    priceServer(() => ({ json: result(closed, { gateway: { heartbeat_at: "2026-11-27T10:05:00Z", paused: true, markets_closed: true }, markets }) }));
    seed({ watchlist: watchlist(["NSE:TCS", "GOLD:XAU_USD"]) });
    renderApp("#/watchlist");
    expect(await screen.findByText("Markets closed, prices from the last close. NSE opens Mon 9:15 AM IST.")).toBeInTheDocument();
    expect(screen.queryByText(/Prices paused/)).not.toBeInTheDocument();
    expect(within(row("Tata Consultancy Services")).getByText("₹4,182.50")).toBeInTheDocument();
  });

  it("AC-9.15: a quiet gateway while a watched market is open still says Prices paused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-26T05:00:00Z") }); // Thursday 10:30 AM IST: NSE open
    const closed = [item("NSE:TCS", { label: "Market closed, last close", market_state: "closed" })];
    priceServer(() => ({ json: result(closed, { gateway: { heartbeat_at: "2026-11-25T10:05:00Z", paused: true, markets_closed: true }, markets: { NSE: market("NSE", "open") } }) }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist");
    expect(await screen.findByText(/^Prices paused since 25 Nov, 3:35 PM IST while NSE is open/)).toBeInTheDocument();
    expect(screen.queryByText(/Markets closed, prices from the last close/)).not.toBeInTheDocument();
  });

  it("AC-9.15: the clock rule (the fallback without the server's market states): closed only when no watched market is open", () => {
    const sat = Date.parse("2026-11-28T06:00:00Z");
    const thuNight = Date.parse("2026-11-26T18:00:00Z"); // 11:30 PM IST, 1 PM New York: US open
    expect(quietBecauseClosed(["NSE:TCS"], true, sat)).toBe(true);
    expect(quietBecauseClosed(["NSE:TCS"], false, sat)).toBe(false);
    expect(quietBecauseClosed(["NSE:TCS", "US:EPAM"], true, thuNight)).toBe(false);
    expect(quietBecauseClosed([], true, sat)).toBe(false);
  });

  it("AC-9.7 (changed CR-0006): no price yet says when it comes; an error keeps the last price", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-26T14:30:00Z") }); // Thursday 8 PM IST
    const waiting = { status: "waiting" as const, price: null, change: null, change_pct: null, as_of: null };
    priceServer(() => ({
      json: result([item("NSE:GOLDBEES", { name: "Gold BeES", ...waiting }), item("US:NEW", { name: "New Co", group: "us", ...waiting }), item("NSE:TCS", { name: "Tata Consultancy Services", status: "error", error: "Not logged in today" })],
        { markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN), US: market("US", "open") } }),
    }));
    seed({ watchlist: watchlist(["NSE:GOLDBEES", "US:NEW", "NSE:TCS"]) });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    expect(within(row("Gold BeES")).getByText("First price when NSE opens, Fri 9:15 AM IST")).toBeInTheDocument();
    expect(within(row("New Co")).getByText("Waiting for the first price")).toBeInTheDocument();
    expect(within(row("Tata Consultancy Services")).getByText("₹4,182.50")).toBeInTheDocument();
    expect(within(row("Tata Consultancy Services")).getByText("Not logged in today")).toBeInTheDocument();
  });

  it("AC-9.8: items the server hides are not shown", async () => {
    priceServer(() => ({ json: result([EPAM], { hidden: ["NSE:TCS"] }) }));
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/watchlist");
    await screen.findByText("EPAM Systems");
    await waitFor(() => expect(screen.getAllByTestId("price-row")).toHaveLength(1));
    expect(screen.queryByText("NSE:TCS")).toBeNull();
    expect(within(screen.getByTestId("strip")).queryByText("TCS")).toBeNull();
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
    renderApp("#/watchlist");
    await waitFor(() => expect(reads(calls)).toBe(1));
    expect(calls.filter((c) => c.path === "/api/market/prices")).toHaveLength(1); // one request for both
    await act(async () => { await vi.advanceTimersByTimeAsync(OPEN_EVERY_MS); });
    await waitFor(() => expect(reads(calls)).toBe(2));
    visibility = "hidden";
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * OPEN_EVERY_MS); });
    expect(reads(calls)).toBe(2);
  });

  it("AC-9.9 (changed CR-0006): with the strip off, the Feed reads no prices", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS]) }));
    seed({ watchlist: watchlist(["NSE:TCS"], { strip: "off" }), topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, settings: { last_refreshed_at: iso(60_000), theme: "system" } });
    renderApp("#/");
    await screen.findByText("Your feed");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("strip")).toBeNull();
    expect(reads(calls)).toBe(0);
  });

  it("AC-9.10: without a price source the Watchlist says so and the rest of Distill works", async () => {
    priceServer(() => ({ status: 409, json: { error: { code: "market_not_set_up", message: "Price source not set up yet." } } }));
    seed({ watchlist: watchlist(["NSE:TCS"]), cards: [card("c1", { title: "Markets today" })], topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, settings: { last_refreshed_at: iso(60_000), theme: "system" } });
    renderApp("#/");
    expect(await screen.findByText("Markets today")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("strip")).toBeNull());
    window.location.hash = "#/watchlist";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByText(/Price source not set up yet/)).toBeInTheDocument();
  });

  it("AC-9.10: a price source that can't be reached says so plainly", async () => {
    priceServer(() => ({ status: 503, json: { error: { code: "market_offline", message: "Prices can't be reached right now." } } }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist");
    expect(await screen.findByText("Prices can't be reached right now. The last prices stay until it's back.")).toBeInTheDocument();
  });

  it("AC-9.11 (changed CR-0006): in Edit mode, remove and move up or down, kept in order", async () => {
    priceServer(() => ({ json: result([TCS, INFY, EPAM]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "NSE:INFY", "US:EPAM"]) });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Infosys up" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:INFY", "NSE:TCS", "US:EPAM"]));
    expect(screen.getByRole("button", { name: "Move Infosys up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove EPAM Systems" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:INFY", "NSE:TCS"]));
    expect(loadLocal().state.watchlist?.pinned).toEqual(["NSE:TCS", "NSE:INFY"]); // a removed item leaves the strip too
  });

  it("AC-9.12 (changed CR-0006): tapping an item opens its detail, which shows the news cards that mention it", async () => {
    priceServer(() => ({ json: result([TCS, EPAM]) }));
    const cards = [card("a", { title: "TCS wins a large deal" }), card("b", { title: "Gold slips", summary: "Nothing about the IT firm." }), card("c", { title: "IT stocks", summary: "Tata Consultancy Services led gains." })];
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]), cards });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    expect(within(row("Tata Consultancy Services")).getByRole("link", { name: "Tata Consultancy Services" })).toHaveAttribute("href", "#/item/NSE%3ATCS");
    window.location.hash = "#/item/NSE%3ATCS";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("link", { name: "TCS wins a large deal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "IT stocks" })).toBeInTheDocument();
    expect(screen.queryByText("Gold slips")).toBeNull();
    window.location.hash = "#/item/US%3AEPAM";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByText("No news cards mention it right now.")).toBeInTheDocument();
    expect(cardsMentioning([card("x", { title: "BTCS rally" })], "TCS", "Tata Consultancy Services")).toHaveLength(0);
  });

  it("AC-9.14: the information-only note, and the MetalCharts credit when gold is shown", async () => {
    priceServer(() => ({ json: result([TCS, GOLD]) }));
    seed({ watchlist: watchlist(["NSE:TCS", "GOLD:XAU_USD"]) });
    renderApp("#/watchlist");
    expect(await screen.findByText(/For information only. Not investment advice. Prices may be delayed./)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "MetalCharts" })).toHaveAttribute("href", "https://metalcharts.org");
  });

  it("CR-0005: a device copy saved by v0.3.0 (no watchlist) loads with an empty list", () => {
    seed({ topics: { sections: ["finance"], keywords: ["gold rate"], updated_at: iso(H) } });
    const raw = JSON.parse(localStorage.getItem("distill.v1")!);
    delete raw.state.watchlist;
    localStorage.setItem("distill.v1", JSON.stringify(raw));
    const got = loadLocal().state;
    expect(got.watchlist).toMatchObject({ keys: [], pinned: [], strip: "every", updated_at: null });
    expect(got.topics.keywords).toEqual(["gold rate"]);
  });
});
