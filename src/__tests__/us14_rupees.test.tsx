import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { money } from "../markets";
import { NO_RATE, rateText, rupeeChange, shown } from "../rupees";
import { loadLocal } from "../storage";
import type { FxRate, HistoryResult, PriceItem } from "../types";
import { GROUPS, badgeOf, priceNotices, upgradeWatchlist, watchedMarkets } from "../watch";
import { linePath } from "../components/Trend";
import { H, iso, renderApp, seed } from "./helpers";
import { EPAM, GOLD, GOLDM, TCS, THU_8PM_IST, item, priceServer, result, watchlist } from "./market_fixtures";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const FX: FxRate = { key: "FX:USDINR", rate: 92.46, as_of: "2026-11-26T15:00:00Z", error: null }; // 26 Nov, 8:30 PM IST
const inr = (it: PriceItem, rate = 92.46): PriceItem => ({
  ...it, price_inr: +(it.price! * rate).toFixed(2), prev_close_inr: it.prev_close === null ? null : +(it.prev_close * rate).toFixed(2),
  change_inr: it.change === null ? null : +(it.change * rate).toFixed(2),
});
const US = inr({ ...EPAM, price: 164.63, prev_close: 160, change: 4.63, change_pct: 2.89 });
const USDINR = item("FX:USDINR", {
  name: "US dollar in rupees", display_name: "US dollar in rupees", short_name: "USD/INR", symbol: "USDINR", exchange: "FX", type: "fx",
  category: "fx", group: "currency", market: "FX", source: "frankfurter", price: 92.46, prev_close: 92.1, change: 0.36, change_pct: 0.39,
  label: "Daily reference rate", market_state: "closed", as_of: FX.as_of,
});
const row = (name: string) => screen.getAllByTestId("price-row").find((r) => within(r).queryByText(name))!;
const history = (series: HistoryResult["series"], available = true, range: HistoryResult["range"] = "1d"): HistoryResult => ({
  range, available, series, hidden: [], read_at: new Date().toISOString(),
});
const pts = (n: number, start: number, step: number, fromIso = "2026-11-26T03:45:00Z", everyMin = 5) =>
  Array.from({ length: n }, (_, i) => ({ at: new Date(Date.parse(fromIso) + i * everyMin * 60_000).toISOString(), price: start + i * step }));

describe("US-14: prices in rupees first, the dollar rate as an item, and trend graphs (CR-0012)", () => {
  it("AC-14.1: rupees first with Indian digit grouping; a US price in rupees with the dollars in brackets", () => {
    expect(money(152217.5, "INR")).toBe("₹1,52,217.50");
    expect(money(2640.3, "INR")).toBe("₹2,640.30");
    const s = shown(US)!;
    expect([s.main, s.usd, s.noRate]).toEqual(["₹15,221.69", "($164.63)", false]);
    expect(s.change).toBe("+₹428.09 (+2.89%)");
    expect(shown(TCS)).toMatchObject({ main: "₹4,182.50", usd: null, noRate: false, change: "+₹10.00 (+0.24%)" });
    expect(rupeeChange(-1240.5, -0.81)).toBe("−₹1,240.50 (−0.81%)");
  });

  it("AC-14.1, AC-14.3: the Watchlist shows ₹ first and $ in brackets for US shares and international gold; Indian items in ₹ only", async () => {
    const gold = inr({ ...GOLD, price: 2650 });
    priceServer(() => ({ json: result([TCS, US, gold], { fx: FX }) }), { "GET /api/market/history": () => ({ json: history({}) }) });
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM", "GOLD:XAU_USD"]) });
    renderApp("#/watchlist");
    await waitFor(() => expect(within(row("EPAM Systems")).getByText("₹15,221.69")).toBeInTheDocument());
    expect(within(row("EPAM Systems")).getByText("($164.63)")).toBeInTheDocument();
    expect(within(row("Gold spot")).getByText("₹2,45,019.00")).toBeInTheDocument();
    expect(within(row("Gold spot")).getByText("($2,650.00)")).toBeInTheDocument();
    expect(within(row("Tata Consultancy Services")).getByText("₹4,182.50")).toBeInTheDocument();
    expect(within(row("Tata Consultancy Services")).queryByText(/\(\$/)).toBeNull();
  });

  it("AC-14.2: the rate and its time show on hover (title) and on tap", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: THU_8PM_IST + 2 * H });
    expect(rateText(FX)).toBe("₹/$ 92.46 at 8:30 PM IST");
    expect(rateText({ ...FX, as_of: "2026-11-24T15:00:00Z" })).toBe("₹/$ 92.46 at 24 Nov, 8:30 PM IST");
    priceServer(() => ({ json: result([US], { fx: FX }) }), { "GET /api/market/history": () => ({ json: history({}) }) });
    seed({ watchlist: watchlist(["US:EPAM"]) });
    renderApp("#/watchlist");
    const btn = await screen.findByRole("button", { name: /₹15,221.69/ });
    expect(btn).toHaveAttribute("title", "₹/$ 92.46 at 8:30 PM IST");
    expect(screen.queryByText("₹/$ 92.46 at 8:30 PM IST")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByText("₹/$ 92.46 at 8:30 PM IST")).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("AC-14.2: an item's detail says which rate its rupee price uses", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: THU_8PM_IST + 2 * H });
    priceServer(() => ({ json: result([US], { fx: FX }) }), { "GET /api/market/history": () => ({ json: history({}) }) });
    seed({ watchlist: watchlist(["US:EPAM"]) });
    renderApp("#/item/US%3AEPAM");
    expect(await screen.findByText("At ₹/$ 92.46 at 8:30 PM IST, the European Central Bank's reference rate.")).toBeInTheDocument();
    const detail = screen.getByRole("article");
    expect(within(detail).getByText("₹15,221.69")).toBeInTheDocument();
    expect(within(detail).getByText("+₹428.09 (+2.89%)").closest(".change")).toHaveClass("up");
  });

  it("AC-14.4: without a rate a US price shows in dollars alone, with ₹ rate not available", async () => {
    priceServer(() => ({ json: result([EPAM], { fx: null }) }), { "GET /api/market/history": () => ({ json: history({}) }) });
    seed({ watchlist: watchlist(["US:EPAM"]) });
    renderApp("#/watchlist");
    await waitFor(() => expect(within(row("EPAM Systems")).getByText("$185.20")).toBeInTheDocument());
    expect(within(row("EPAM Systems")).getByText(NO_RATE)).toBeInTheDocument();
    expect(within(row("EPAM Systems")).queryByRole("button", { name: /\$185.20/ })).toBeNull();
    expect(shown(EPAM)).toMatchObject({ main: "$185.20", usd: null, noRate: true, change: "−4.80 (−2.53%)" });
  });

  it("AC-14.5: US dollar in rupees sits in its own Currency group as a daily rate that never makes prices look paused", async () => {
    expect(GROUPS.map((g) => g.label)).toEqual(["Gold", "Indian shares", "US shares", "Currency"]);
    expect(badgeOf(USDINR)).toEqual({ text: "FX", gold: false });
    const quiet = result([USDINR], { gateway: { heartbeat_at: iso(H), paused: true } });
    expect(watchedMarkets(quiet)).toEqual([]);
    expect(priceNotices("ok", quiet)).toEqual([]);
    priceServer(() => ({ json: result([TCS, USDINR], { fx: FX }) }), { "GET /api/market/history": () => ({ json: history({}) }) });
    seed({ watchlist: watchlist(["NSE:TCS", "FX:USDINR"]) });
    renderApp("#/watchlist");
    expect(await screen.findByRole("heading", { name: /Currency/ })).toBeInTheDocument();
    const fx = row("US dollar in rupees");
    expect(within(fx).getByText("₹92.46")).toBeInTheDocument();
    expect(within(fx).getByText("₹ per $ · ECB daily rate")).toBeInTheDocument();
  });

  it("AC-14.6: the Add sheet's Currency filter lists the dollar rate with nothing typed, and it can be added", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS]) }), {
      "GET /api/market/search": (_b: unknown, url: string) => ({ json: url.includes("group=currency") ? [USDINR] : [] }),
      "GET /api/market/history": () => ({ json: history({}) }),
    });
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist/add");
    fireEvent.click(await screen.findByRole("button", { name: "Currency" }));
    const add = await screen.findByRole("button", { name: "Add US dollar in rupees" });
    expect(screen.getByText("₹ per US dollar · daily reference rate")).toBeInTheDocument();
    fireEvent.click(add);
    await waitFor(() => expect(loadLocal().state.watchlist?.keys).toEqual(["NSE:TCS", "FX:USDINR"]));
    expect(calls.some((c) => c.path === "/api/market/search")).toBe(true);
  });

  it("AC-14.7: each item shows a small graph of today's price, green when up and red when down, with an arrow", async () => {
    const down = { ...TCS, change: -12, change_pct: -0.29 };
    priceServer(() => ({ json: result([down, US], { fx: FX }) }), {
      "GET /api/market/history": () => ({ json: history({ "NSE:TCS": pts(12, 4190, -1), "US:EPAM": pts(6, 160, 1, "2026-11-25T14:30:00Z") }) }),
    });
    seed({ watchlist: watchlist(["NSE:TCS", "US:EPAM"]) });
    renderApp("#/watchlist");
    await waitFor(() => expect(screen.getAllByTestId("spark").length).toBeGreaterThanOrEqual(2));
    const tcs = row("Tata Consultancy Services");
    expect(within(tcs).getByTestId("spark")).toHaveClass("down");
    expect(within(row("EPAM Systems")).getByTestId("spark")).toHaveClass("up");
    expect(tcs.querySelector(".arrow.down")).not.toBeNull();
    expect(within(tcs).getByText("−₹12.00 (−0.29%)")).toBeInTheDocument();
  });

  it("AC-14.7: with no history yet (or a gateway without it), just the arrow and the change", async () => {
    priceServer(() => ({ json: result([TCS]) }), { "GET /api/market/history": () => ({ json: history({ "NSE:TCS": [] }) }) });
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/watchlist");
    await waitFor(() => expect(within(row("Tata Consultancy Services")).getByText("+₹10.00 (+0.24%)")).toBeInTheDocument());
    expect(screen.queryByTestId("spark")).toBeNull();
    expect(row("Tata Consultancy Services").querySelector(".arrow.up")).not.toBeNull();
  });

  it("AC-14.7: the strip shows the arrow and the small graph too, and history is read with the prices, not more often", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS]) }), {
      "GET /api/market/history": () => ({ json: history({ "NSE:TCS": pts(8, 4170, 2) }) }),
    });
    seed({ topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, settings: { last_refreshed_at: iso(60_000), theme: "system" },
      watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/");
    const strip = await screen.findByRole("navigation", { name: "Pinned prices" });
    await waitFor(() => expect(within(strip).getByTestId("spark")).toHaveClass("up"));
    expect(strip.querySelector(".arrow.up")).not.toBeNull();
    expect(calls.filter((c) => c.path === "/api/market/history")).toHaveLength(1);
  });

  it("AC-14.8: tapping an item opens a bigger graph with 1D, 1W and 1M", async () => {
    const { calls } = priceServer(() => ({ json: result([TCS]) }), {
      "GET /api/market/history": (_b: unknown, url: string) => {
        if (url.includes("range=1w")) return { json: history({ "NSE:TCS": pts(40, 4000, 5, "2026-11-19T04:00:00Z", 240) }, true, "1w") };
        if (url.includes("range=1m")) return { json: history({ "NSE:TCS": [] }, true, "1m") };
        return { json: history({ "NSE:TCS": pts(12, 4172.5, 1) }) };
      },
    });
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/item/NSE%3ATCS");
    const chart = await screen.findByTestId("trend-chart");
    expect(chart).toHaveAccessibleName(/^Price over today: from ₹4,172.50 to ₹4,183.50/);
    expect(screen.getByText("Yesterday's close")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1D" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "1W" }));
    await waitFor(() => expect(screen.getByTestId("trend-chart")).toHaveAccessibleName(/^Price over the last week: from ₹4,000.00 to ₹4,195.00/));
    expect(calls.some((c) => c.path === "/api/market/history" && c.method === "GET")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1M" }));
    expect(await screen.findByText("Not enough prices yet for this graph.")).toBeInTheDocument();
  });

  it("AC-14.8: before the gateway keeps history, the detail says so calmly; a failed read says try again", async () => {
    priceServer(() => ({ json: result([TCS]) }), {
      "GET /api/market/history": (_b: unknown, url: string) =>
        url.includes("range=1w") ? { status: 503, json: { error: { code: "market_offline", message: "x" } } } : { json: history({}, false) },
    });
    seed({ watchlist: watchlist(["NSE:TCS"]) });
    renderApp("#/item/NSE%3ATCS");
    expect(await screen.findByText("Price graphs start once the price service keeps a history.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1W" }));
    expect(await screen.findByText("The graph can't be loaded right now. Try again in a moment.")).toBeInTheDocument();
  });

  it("AC-14.8: the graph line is drawn from the points' times and prices", () => {
    expect(linePath([], 100, 50)).toBe("");
    expect(linePath([{ at: "2026-11-26T04:00:00Z", price: 1 }], 100, 50)).toBe("M0 25.0H100");
    const d = linePath([{ at: "2026-11-26T04:00:00Z", price: 1 }, { at: "2026-11-26T05:00:00Z", price: 3 }], 100, 50);
    expect(d).toBe("M0.0 46.0L100.0 4.0");
  });

  it("AC-14.9: the founder's Settings has the switch Share Zerodha prices with other users, which saves at once", async () => {
    let on = true;
    const { calls } = priceServer(() => ({ json: result([]) }), {
      "GET /auth/me": () => ({ json: { signed_in: true, user: { name: "Akki", role: "admin" } } }),
      "GET /api/sources": () => ({ json: { sources: [] } }),
      "GET /api/admin/market-sharing": () => ({ json: { share_kite: on, updated_at: null, saved_in_database: true } }),
      "PUT /api/admin/market-sharing": (b: { share_kite: boolean }) => {
        on = b.share_kite;
        return { json: { share_kite: on, updated_at: "2026-11-27T08:00:00Z", saved_in_database: true } };
      },
    });
    renderApp("#/settings");
    const sw = await screen.findByRole("switch", { name: "Share Zerodha prices with other users" });
    expect(sw).toBeChecked();
    expect(screen.getByText(/Each person's watchlist stays private to them/)).toBeInTheDocument();
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Share Zerodha prices with other users" })).not.toBeChecked());
    expect(calls.find((c) => c.method === "PUT" && c.path === "/api/admin/market-sharing")?.body).toEqual({ share_kite: false });
    expect(screen.getByText(/Off: only you see prices from Zerodha/)).toBeInTheDocument();
  });

  it("AC-14.9: people who aren't the admin never see the switch", async () => {
    priceServer(() => ({ json: result([]) }), {
      "GET /auth/me": () => ({ json: { signed_in: true, user: { name: "Ben", role: "user" } } }),
      "GET /api/sources": () => ({ json: { sources: [] } }),
    });
    renderApp("#/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Prices (admin)")).toBeNull());
    expect(screen.queryByRole("switch", { name: "Share Zerodha prices with other users" })).toBeNull();
  });

  it("AC-9.8 (changed CR-0012): the India gold rate shows for anyone the server sends it to, with no founder-only wording", async () => {
    priceServer(() => ({ json: result([GOLDM]) }), { "GET /api/market/history": () => ({ json: history({}) }) });
    seed({ watchlist: watchlist(["MCX:GOLDM"]) });
    renderApp("#/watchlist");
    await waitFor(() => expect(within(row("Gold rate, India")).getByText("₹76,840.00")).toBeInTheDocument());
    expect(screen.queryByText(/founder/i)).toBeNull();
  });

  it("AC-14.12: a watchlist saved by v0.8.0 keeps its items, order, pins and strip setting", () => {
    const v080 = { keys: ["NSE:TCS", "US:EPAM", "MCX:GOLDM"], more: [], pinned: ["US:EPAM"], strip: "feed", version: 2, updated_at: "2026-11-26T07:00:00Z" };
    expect(upgradeWatchlist(v080)).toEqual({ ...v080, more: [] });
  });
});
