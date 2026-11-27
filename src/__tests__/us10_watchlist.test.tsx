import { createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_EVERY_MS, CLOSED_EVERY_MS, refreshEvery } from "../markets";
import { loadLocal } from "../storage";
import { badgeOf, moveOnto, priceNotices, upgradeWatchlist, waitingText, watchedMarkets, whenLabel } from "../watch";
import { H, card, iso, renderApp, seed } from "./helpers";
import {
  EPAM, FRI_NSE_OPEN, FRI_US_OPEN, GOLD, GOLDBEES, GOLDM, GOLDMF, INFY, SGB, TCS, THU_8PM_IST, item, market, priceServer, reads, result, watchlist,
} from "./market_fixtures";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const feedState = { topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, settings: { last_refreshed_at: iso(60_000), theme: "system" as const } };
const go = (hash: string) => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};
const row = (name: string) => screen.getAllByTestId("price-row").find((r) => within(r).queryByText(name))!;
const ALL = [GOLDM, GOLD, GOLDBEES, SGB, GOLDMF, TCS, INFY, EPAM];
const ALL_KEYS = ALL.map((i) => i.key);

describe("US-10: Watchlist page and pinned prices strip (CR-0006)", () => {
  it("AC-10.1: the strip shows each pinned item's short name, badge, price and change, and opens its detail", async () => {
    priceServer(() => ({ json: result(ALL) }));
    seed({ ...feedState, watchlist: watchlist(ALL_KEYS, { pinned: ["MCX:GOLDM", "NSE:TCS", "US:EPAM", "NSE:GOLDBEES"] }) });
    renderApp("#/");
    const strip = await screen.findByRole("navigation", { name: "Pinned prices" });
    const tiles = await within(strip).findAllByRole("link");
    await waitFor(() => expect(within(strip).getByText("Gold India")).toBeInTheDocument());
    expect(within(strip).getAllByRole("listitem")).toHaveLength(5); // 4 pinned and the free-slots tile
    const tcs = tiles.find((t) => t.getAttribute("href") === "#/item/NSE%3ATCS")!;
    expect(within(tcs).getByText("TCS")).toBeInTheDocument();
    expect(within(tcs).getByText("NSE")).toHaveClass("badge");
    expect(within(tcs).getByText("₹4,182.50")).toBeInTheDocument();
    expect(within(tcs).getByText("+0.24%")).toBeInTheDocument();
    const epam = within(strip).getByText("EPAM").closest("a")!;
    expect(within(epam).getByText("−2.53%").closest(".tc")).toHaveClass("down");
    expect(within(within(strip).getByText("Gold India").closest("a")!).getByText("₹/10 g")).toHaveClass("gold");
    expect(within(strip).getByRole("link", { name: "2 more slots · Edit" })).toHaveAttribute("href", "#/watchlist");
    expect(within(strip).queryByText("Gold spot")).toBeNull(); // not pinned
  });

  it("AC-10.1: six pinned leave no free-slot tile, and the strip keeps the pinned order", async () => {
    priceServer(() => ({ json: result(ALL) }));
    const pinned = ["NSE:INFY", "US:EPAM", "NSE:TCS", "GOLD:XAU_USD", "MCX:GOLDM", "NSE:GOLDBEES"];
    seed({ ...feedState, watchlist: watchlist(ALL_KEYS, { pinned }) });
    renderApp("#/");
    const strip = await screen.findByRole("navigation", { name: "Pinned prices" });
    await waitFor(() => expect(within(strip).getByText("Infosys")).toBeInTheDocument());
    expect(within(strip).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(pinned.map((k) => `#/item/${encodeURIComponent(k)}`));
  });

  it("AC-10.2: the Watchlist replaces the Prices tab, the old link still opens it, items grouped with counts", async () => {
    priceServer(() => ({ json: result(ALL) }));
    seed({ watchlist: watchlist(ALL_KEYS) });
    renderApp("#/prices");
    expect(await screen.findByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    for (const nav of screen.getAllByRole("navigation", { name: "Main" })) {
      expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Feed", "Watchlist", "Saved", "Topics"]);
    }
    await screen.findAllByTestId("price-row");
    const groups = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).filter((t) => /shares|Gold/.test(t ?? ""));
    expect(groups).toEqual(["Gold5", "Indian shares2", "US shares1"]);
    expect(within(screen.getByRole("list", { name: /^Gold/ })).getAllByTestId("price-row")).toHaveLength(5);
  });

  it("AC-10.3: the star pins and unpins (aria-pressed), at most 6, kept with the account copy", async () => {
    const { calls } = priceServer(() => ({ json: result(ALL) }));
    seed({ watchlist: watchlist(ALL_KEYS, { pinned: ["NSE:TCS"] }) });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    const star = screen.getByRole("button", { name: "Pin Infosys" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(star);
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toEqual(["NSE:TCS", "NSE:INFY"]));
    expect(screen.getByRole("button", { name: "Pin Infosys" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pin Tata Consultancy Services" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toEqual(["NSE:INFY"]));
    for (const name of ["Gold spot", "Gold rate, India", "Nippon India ETF Gold BeES", "SGBJUN31I", "HDFC Gold ETF Fund of Fund"]) {
      fireEvent.click(screen.getByRole("button", { name: `Pin ${name}` }));
    }
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toHaveLength(6));
    fireEvent.click(screen.getByRole("button", { name: "Pin EPAM Systems" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The strip holds up to 6 items. Unpin one first.");
    expect(loadLocal().state.watchlist?.pinned).toHaveLength(6);
    const sync = calls.filter((c) => c.method === "PUT" && c.path === "/api/me/state").at(-1);
    expect(sync?.body.watchlist).toMatchObject({ pinned: loadLocal().state.watchlist?.pinned, version: 2 });
  });

  it("AC-10.3: a newly added item goes on the strip while there is room, and not when it is full", async () => {
    priceServer(() => ({ json: result([]) }), {
      "GET /api/market/search": (_b: unknown, url: string) => ({
        json: url.includes("q=hdfc") ? [item("NSE:HDFCGOLD", { name: "HDFC Gold ETF" })] : [item("US:MSFT", { name: "Microsoft" })],
      }),
    });
    const five = ["A:1", "A:2", "A:3", "A:4", "A:5"];
    seed({ watchlist: watchlist(five) });
    renderApp("#/watchlist/add");
    const box = await screen.findByLabelText("Search by name or symbol");
    fireEvent.change(box, { target: { value: "hdfc" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add HDFC Gold ETF" }, { timeout: 2000 }));
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toEqual([...five, "NSE:HDFCGOLD"]));
    fireEvent.change(box, { target: { value: "msft" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Microsoft" }, { timeout: 2000 }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toContain("US:MSFT"));
    expect(loadLocal().state.watchlist?.pinned).toEqual([...five, "NSE:HDFCGOLD"]);
  });

  it("AC-10.4: Edit mode moves an item only within its group, and drag works there too", async () => {
    priceServer(() => ({ json: result(ALL) }));
    seed({ watchlist: watchlist(ALL_KEYS) });
    renderApp("#/watchlist");
    await screen.findAllByTestId("price-row");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Move HDFC Gold ETF Fund of Fund down" })).toBeDisabled(); // last of Gold
    expect(screen.getByRole("button", { name: "Move Tata Consultancy Services up" })).toBeDisabled(); // first of Indian shares
    fireEvent.click(screen.getByRole("button", { name: "Move Tata Consultancy Services down" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys.slice(5, 7)).toEqual(["NSE:INFY", "NSE:TCS"]));
    // drag Gold spot onto Gold rate, India (same group)
    const from = row("Gold spot");
    const onto = row("Gold rate, India");
    fireEvent.dragStart(from);
    const over = createEvent.dragOver(onto);
    fireEvent(onto, over);
    expect(over.defaultPrevented).toBe(true);
    fireEvent.drop(onto);
    await waitFor(() => expect(loadLocal().state.watchlist?.keys.slice(0, 2)).toEqual(["GOLD:XAU_USD", "MCX:GOLDM"]));
    // a drop across groups is not allowed
    fireEvent.dragStart(row("EPAM Systems"));
    const across = createEvent.dragOver(row("Infosys"));
    fireEvent(row("Infosys"), across);
    expect(across.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove Infosys" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).not.toContain("NSE:INFY"));
    expect(moveOnto(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("AC-10.4: the strip order is set under On top of every screen", async () => {
    priceServer(() => ({ json: result(ALL) }));
    seed({ watchlist: watchlist(ALL_KEYS, { pinned: ["NSE:TCS", "US:EPAM", "MCX:GOLDM"] }) });
    renderApp("#/watchlist");
    const panel = (await screen.findByRole("heading", { name: "On top of every screen" })).closest("section")!;
    await waitFor(() => expect(within(panel).getByText("TCS")).toBeInTheDocument());
    expect(within(panel).getByText("3 of 6 pinned. Drag or use the arrows to set the order.")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Move Gold India earlier in the strip" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toEqual(["NSE:TCS", "MCX:GOLDM", "US:EPAM"]));
    expect(within(panel).getByRole("button", { name: "Move TCS earlier in the strip" })).toBeDisabled();
    const items = within(panel).getAllByRole("listitem");
    fireEvent.dragStart(items[2]);
    fireEvent.dragOver(items[0]);
    fireEvent.drop(items[0]);
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toEqual(["US:EPAM", "NSE:TCS", "MCX:GOLDM"]));
  });

  it("AC-10.5: searching gold lists the five gold types under their own headings, each explained; Added for items already in", async () => {
    const hits = [GOLDM, GOLD, GOLDBEES, item("NSE:HDFCGOLD", { name: "HDFC Gold ETF", category: "gold_etf", group: "gold" }), SGB, GOLDMF];
    const { calls } = priceServer(() => ({ json: result([]) }), { "GET /api/market/search": () => ({ json: hits }) });
    seed({ watchlist: watchlist(["NSE:GOLDBEES"]) });
    renderApp("#/watchlist/add");
    expect(screen.getByRole("dialog", { name: "Add to watchlist" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search by name or symbol"), { target: { value: "gold" } });
    await screen.findByRole("button", { name: "Add HDFC Gold ETF" }, { timeout: 2000 });
    const headings = within(screen.getByRole("dialog")).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["₹/10 gGold rate, India", "SpotInternational gold", "ETFGold ETFs", "SGBSovereign Gold Bonds", "MFGold mutual funds"]);
    expect(screen.getByText("Government bonds: 1 unit = 1 g of gold, plus 2.5% interest a year. Few trades a day.")).toBeInTheDocument();
    expect(screen.getByText("What 10 g of 24K gold costs in India today, from MCX. Before GST.")).toBeInTheDocument();
    const etfs = screen.getByRole("region", { name: /Gold ETFs$/ });
    expect(within(etfs).getByRole("button", { name: "Added" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gold" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/market/search" && c.method === "GET")).toBe(true));
    expect(screen.getByRole("button", { name: "Gold" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "US shares" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Sovereign Gold Bonds$/ })).toBeNull());
  });

  it("AC-10.5: a filter chip asks the server for that group, and Gold with nothing typed lists the gold types", async () => {
    const urls: string[] = [];
    priceServer(() => ({ json: result([]) }), { "GET /api/market/search": (_b: unknown, url: string) => (urls.push(url), { json: [GOLD] }) });
    renderApp("#/watchlist/add");
    fireEvent.click(await screen.findByRole("button", { name: "Gold" }));
    await waitFor(() => expect(urls.at(-1)).toMatch(/q=&group=gold$/), { timeout: 2000 });
    expect(await screen.findByRole("heading", { name: /International gold$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Indian shares" }));
    fireEvent.change(screen.getByLabelText("Search by name or symbol"), { target: { value: "tata" } });
    await waitFor(() => expect(urls.at(-1)).toMatch(/q=tata&group=india$/), { timeout: 2000 });
  });

  it("AC-10.13: when the India gold rate isn't in the price service, its heading says why instead of a bare none", async () => {
    priceServer(() => ({ json: result([]) }), { "GET /api/market/search": () => ({ json: [GOLD, GOLDBEES] }) });
    renderApp("#/watchlist/add");
    fireEvent.change(screen.getByLabelText("Search by name or symbol"), { target: { value: "gold" } });
    const spot = await screen.findByRole("region", { name: /International gold$/ }, { timeout: 2000 });
    expect(await within(spot).findByRole("button", { name: /^Add / }, { timeout: 2000 })).toBeInTheDocument();
    const india = screen.getByRole("region", { name: /Gold rate, India$/ });
    expect(within(india).getByText(/comes from the studio's Zerodha connection/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /Sovereign Gold Bonds$/ })).getByText("None in the price service yet.")).toBeInTheDocument();
  });

  it("AC-10.6: each kind has its badge", () => {
    expect([GOLDM, GOLD, GOLDBEES, SGB, GOLDMF, TCS, EPAM].map((i) => badgeOf(i).text)).toEqual(["₹/10 g", "Spot", "ETF", "SGB", "MF", "NSE", "US"]);
    expect(badgeOf(GOLDBEES).gold).toBe(true);
    expect(badgeOf(item("NSE:NIFTYBEES", { category: "etf" })).text).toBe("ETF");
    expect(badgeOf(item("NSE:NIFTYBEES", { category: "etf" })).gold).toBe(false);
  });

  it("AC-10.7: an item's detail: price, change, time, label, what it is, source, its news and the note", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: THU_8PM_IST });
    const sgb = { ...SGB, market_state: "closed", label: "Market closed, last close", as_of: "2026-11-26T10:00:00Z" };
    priceServer(() => ({ json: result([sgb, TCS], { markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN) } }) }));
    seed({ watchlist: watchlist(["NSE:SGBJUN31I-GB", "NSE:TCS"], { pinned: ["NSE:TCS"] }), cards: [card("n1", { title: "SGBJUN31I trades at a discount" })] });
    renderApp("#/item/NSE%3ASGBJUN31I-GB");
    expect(await screen.findByRole("heading", { level: 1, name: "SGBJUN31I" })).toBeInTheDocument();
    expect(screen.getByText("₹7,480.00")).toBeInTheDocument();
    expect(screen.getByText("+₹12.00 (+0.16%)").closest(".change")).toHaveClass("up"); // changed CR-0012: ₹ and an arrow
    expect(screen.getByText("since the previous close")).toBeInTheDocument();
    expect(screen.getByText("Market closed, last close at 26 Nov, 3:30 PM IST. Opens Fri 9:15 AM IST.")).toBeInTheDocument();
    expect(screen.getByText(/^Sovereign Gold Bond: 1 unit = 1 g of gold, 2.5% yearly interest/)).toBeInTheDocument();
    expect(screen.getByText("Zerodha (the studio's connection)")).toBeInTheDocument(); // changed CR-0012
    expect(screen.getByRole("link", { name: "SGBJUN31I trades at a discount" })).toBeInTheDocument();
    expect(screen.getByText(/For information only. Not investment advice./)).toBeInTheDocument();
    const pin = screen.getByRole("button", { name: "Pin on top" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pin);
    await waitFor(() => expect(loadLocal().state.watchlist?.pinned).toEqual(["NSE:TCS", "NSE:SGBJUN31I-GB"]));
    expect(screen.getByRole("button", { name: "Pinned on top" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:TCS"]));
    await waitFor(() => expect(window.location.hash).toBe("#/watchlist"));
  });

  it("AC-10.7: an item no longer in the watchlist says so", async () => {
    priceServer(() => ({ json: result([TCS]) }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/item/US%3AGONE");
    expect(await screen.findByText("This item isn't in your watchlist")).toBeInTheDocument();
  });

  it("AC-10.8: amber only while a watched market is open and the gateway is quiet; closed markets stay calm", () => {
    const now = THU_8PM_IST; // Thursday 8 PM IST
    const quiet = { heartbeat_at: "2026-11-26T09:00:00Z", paused: true };
    const closed = result([TCS, EPAM], { gateway: quiet, markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN), US: market("US", "closed", FRI_US_OPEN) } });
    expect(priceNotices("ok", closed, now).map((n) => [n.tone, n.text])).toEqual([
      ["calm", "Markets closed, prices from the last close. NSE opens Fri 9:15 AM IST, US at 8:00 PM IST."],
    ]);
    expect(priceNotices("ok", closed, now)[0].short).toBe("Markets closed · NSE opens Fri 9:15 AM IST, US at 8:00 PM IST");
    const open = result([TCS, EPAM], { gateway: quiet, markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN), US: market("US", "open") } });
    expect(priceNotices("ok", open, now).map((n) => [n.tone, n.text])).toEqual([["amber", "Prices paused since 2:30 PM IST while US is open. The last prices are shown."]]);
    const fine = result([TCS, EPAM], { markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN), US: market("US", "open") } });
    expect(priceNotices("ok", fine, now)).toEqual([]); // prices flowing: nothing to say
    const waiting = { status: "waiting" as const, price: null, change: null, change_pct: null, as_of: null };
    const first = result([{ ...TCS, ...waiting }], { gateway: { heartbeat_at: null, paused: true }, markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN) } });
    expect(priceNotices("ok", first, now).map((n) => n.text)).toEqual(["Prices start when the market opens (NSE Fri 9:15 AM IST)."]);
    const morning = Date.parse("2026-11-27T02:00:00Z"); // Fri 7:30 AM IST: opens later today
    expect(priceNotices("ok", first, morning).map((n) => n.text)).toEqual(["Prices start when the market opens (NSE 9:15 AM IST)."]);
    expect(waitingText({ ...TCS, ...waiting }, first, now)).toBe("First price when NSE opens, Fri 9:15 AM IST");
    expect(waitingText(GOLDMF, first, now)).toBe("First NAV after about 9 PM IST");
    const holiday = result([TCS, EPAM], { gateway: quiet, markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN), US: market("US", "closed", FRI_US_OPEN, { holiday: true, note: "Thanksgiving Day" }) } });
    expect(priceNotices("ok", holiday, now).map((n) => [n.icon, n.text])).toEqual([
      ["calendar", "US market closed today for a holiday (Thanksgiving Day). Opens Fri 8:00 PM IST."],
      ["moon", "Markets closed, prices from the last close. NSE opens Fri 9:15 AM IST."],
    ]);
    expect(priceNotices("offline", closed, now).map((n) => [n.tone, n.text])).toEqual([["error", "Prices can't be reached right now. The last prices stay until it's back."]]);
    expect(whenLabel(FRI_NSE_OPEN, now)).toBe("Fri 9:15 AM IST");
  });

  it("AC-10.14: an open gold spot alone never shows Prices paused while the gateway rests overnight", () => {
    const now = Date.parse("2026-11-27T00:30:00Z"); // Fri 6:00 AM IST: NSE, MCX and US shut, gold spot open by its hours
    const quiet = { heartbeat_at: "2026-11-26T21:05:00Z", paused: true }; // last check-in 2:35 AM IST
    const gold = { ...GOLD, market_state: "open", label: "Live", as_of: "2026-11-26T19:40:00Z" }; // 1:10 AM IST
    const shut = { NSE: market("NSE", "closed", FRI_NSE_OPEN), US: market("US", "closed", FRI_US_OPEN), GOLD: market("GOLD", "open") };
    const mixed = result([TCS, EPAM, gold], { gateway: quiet, markets: shut });
    const notes = priceNotices("ok", mixed, now);
    expect(notes.map((n) => [n.tone, n.text])).toEqual([
      ["calm", "Markets closed, prices from the last close. NSE opens 9:15 AM IST, US at 8:00 PM IST. Gold spot price from 1:10 AM IST."],
    ]);
    expect(notes.some((n) => /Prices paused/.test(n.text))).toBe(false);
    // Only gold spot watched: a calm note with gold's own price time, no amber.
    const alone = result([gold], { gateway: quiet, markets: { GOLD: market("GOLD", "open") } });
    expect(priceNotices("ok", alone, now).map((n) => [n.tone, n.text, n.short])).toEqual([
      ["calm", "Gold spot updates a few times a day. Price from 1:10 AM IST.", "Gold spot · price from 1:10 AM IST"],
    ]);
    // Same by the device clock (no market states from the server).
    expect(priceNotices("ok", result([gold], { gateway: quiet }), now).map((n) => n.tone)).toEqual(["calm"]);
    // Gateway checking in: nothing to say about gold alone.
    expect(priceNotices("ok", result([gold], { markets: { GOLD: market("GOLD", "open") } }), now)).toEqual([]);
  });

  it("AC-10.14: Prices paused still shows when NSE, MCX or the US market is open and the gateway is quiet", () => {
    const quiet = { heartbeat_at: "2026-11-26T09:00:00Z", paused: true };
    const gold = { ...GOLD, market_state: "open" };
    const now = THU_8PM_IST;
    for (const m of ["NSE", "MCX", "US"]) {
      const watched = { NSE: TCS, MCX: GOLDM, US: EPAM }[m]!;
      const r = result([watched, gold], { gateway: quiet, markets: { [m]: market(m, "open"), GOLD: market("GOLD", "open") } });
      expect(priceNotices("ok", r, now).map((n) => [n.tone, n.text])).toEqual([["amber", `Prices paused since 2:30 PM IST while ${m} is open. The last prices are shown.`]]);
    }
    // By the device clock too: Thursday 11 AM IST, NSE open, no market states from the server.
    const morning = Date.parse("2026-11-26T05:30:00Z");
    const r = result([TCS, gold], { gateway: { heartbeat_at: "2026-11-26T05:20:00Z", paused: true } });
    expect(priceNotices("ok", r, morning).map((n) => n.text)).toEqual(["Prices paused since 10:50 AM IST while NSE is open. The last prices are shown."]);
  });

  it("AC-10.14: the Watchlist with only gold spot shows a calm note, not Prices paused, overnight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-27T00:30:00Z") });
    const gold = { ...GOLD, market_state: "open", label: "Live", as_of: "2026-11-26T19:40:00Z" };
    priceServer(() => ({ json: result([gold], { gateway: { heartbeat_at: "2026-11-26T21:05:00Z", paused: true }, markets: { GOLD: market("GOLD", "open") } }) }));
    seed({ ...feedState, watchlist: watchlist(["GOLD:XAU_USD"]) });
    renderApp("#/watchlist");
    expect(await screen.findByText("Gold spot updates a few times a day. Price from 1:10 AM IST.")).toBeInTheDocument();
    expect(screen.queryByText(/Prices paused/)).toBeNull();
  });

  it("AC-10.8: the strip carries the calm note in one line, with a link to the Watchlist on the Feed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: THU_8PM_IST });
    priceServer(() => ({ json: result([TCS], { gateway: { heartbeat_at: "2026-11-26T09:00:00Z", paused: true }, markets: { NSE: market("NSE", "closed", FRI_NSE_OPEN) } }) }));
    seed({ ...feedState, watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/");
    expect(await screen.findByText("Markets closed · NSE opens Fri 9:15 AM IST")).toBeInTheDocument();
    expect(screen.queryByText(/Prices paused/)).toBeNull();
    expect(screen.getByText("Watchlist", { selector: "a.strip-link" })).toHaveAttribute("href", "#/watchlist");
  });

  it("AC-10.9: the server's market states (the gateway's calendar or its clock) decide, the device clock only without them", () => {
    const at = Date.parse("2026-11-26T05:00:00Z"); // NSE open by the clock
    expect(refreshEvery(["NSE:TCS"], at, { NSE: market("NSE", "closed", FRI_NSE_OPEN) })).toBe(CLOSED_EVERY_MS); // a holiday per the calendar
    expect(refreshEvery(["NSE:TCS"], at)).toBe(OPEN_EVERY_MS);
    const noMarkets = result([TCS]);
    expect(watchedMarkets(noMarkets, at).map((m) => [m.market, m.state, m.source])).toEqual([["NSE", "open", "clock"]]);
    expect(watchedMarkets(result([TCS, GOLDMF], { markets: { NSE: market("NSE", "closed") } }), at).map((m) => m.market)).toEqual(["NSE"]); // funds have no hours
  });

  it("AC-10.10: items show the server's tidy names", async () => {
    priceServer(() => ({ json: result([item("NSE:TCS", { name: "TATA CONSULTANCY SERV LT", display_name: "Tata Consultancy Services" })]) }));
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist");
    expect(await screen.findByRole("link", { name: "Tata Consultancy Services" })).toBeInTheDocument();
    expect(screen.queryByText("TATA CONSULTANCY SERV LT")).toBeNull();
  });

  it("AC-10.11: Every screen, Feed only or Off, saved with the watchlist; Off and Feed only hide the strip and its reads", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS]) }));
    seed({ ...feedState, watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist");
    const group = await screen.findByRole("group", { name: "Show pinned prices" });
    expect(within(group).getByRole("button", { name: "Every screen" })).toHaveAttribute("aria-pressed", "true");
    go("#/saved");
    expect(await screen.findByTestId("strip")).toBeInTheDocument();
    go("#/watchlist");
    fireEvent.click(within(await screen.findByRole("group", { name: "Show pinned prices" })).getByRole("button", { name: "Feed only" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.strip).toBe("feed"));
    go("#/saved");
    await waitFor(() => expect(screen.queryByTestId("strip")).toBeNull());
    go("#/");
    expect(await screen.findByTestId("strip")).toBeInTheDocument();
    go("#/watchlist");
    fireEvent.click(within(await screen.findByRole("group", { name: "Show pinned prices" })).getByRole("button", { name: "Off" }));
    await waitFor(() => expect(loadLocal().state.watchlist?.strip).toBe("off"));
    const sync = calls.filter((c) => c.method === "PUT" && c.path === "/api/me/state").at(-1);
    expect(sync?.body.watchlist.strip).toBe("off");
    go("#/");
    await screen.findByText("Your feed");
    const before = reads(calls);
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByTestId("strip")).toBeNull();
    expect(reads(calls)).toBe(before);
  });

  it("AC-10.12: a watchlist saved by v0.4.0 loads with its first 6 pinned and the strip on every screen", async () => {
    const keys = ["NSE:TCS", "US:EPAM", "GOLD:XAU_USD", "NSE:GOLDBEES", "NSE:INFY", "MCX:GOLDM", "MF:119132"];
    seed({ ...feedState, watchlist: { keys, updated_at: iso(H) } }); // exactly the v0.4.0 shape
    const w = loadLocal().state.watchlist!;
    expect(w).toMatchObject({ keys, more: [], pinned: keys.slice(0, 6), strip: "every", version: 2 });
    priceServer(() => ({ json: result([TCS, EPAM, GOLD, GOLDBEES, INFY, GOLDM, GOLDMF]) }));
    renderApp("#/");
    const strip = await screen.findByRole("navigation", { name: "Pinned prices" });
    await waitFor(() => expect(within(strip).getAllByRole("link")).toHaveLength(6));
  });

  it("AC-10.12: items 11 to 20 are kept apart, so v0.4.0 can still read the copy; bad data is tidied", () => {
    const keys = Array.from({ length: 22 }, (_, n) => `US:A${n}`);
    const w = upgradeWatchlist({ keys: [...keys.slice(0, 10), "US:A0"], more: keys.slice(10), pinned: ["US:A3", "US:GONE", 7], strip: "nope", updated_at: 5 });
    expect(w.keys).toEqual(keys.slice(0, 10));
    expect(w.more).toEqual(keys.slice(10, 20));
    expect(w.pinned).toEqual(["US:A3"]);
    expect(w.strip).toBe("every");
    expect(w.updated_at).toBeNull();
    expect(upgradeWatchlist(undefined)).toMatchObject({ keys: [], pinned: [], strip: "every", version: 2 });
  });
});
