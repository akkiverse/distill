import type { MarketInfo, PriceItem, PricesResult, Watchlist } from "../types";
import { H, deviceOnly, fakeServer, iso } from "./helpers";

const GOLD_PREFIX = ["GOLD", "MCX", "MF"];

/** A price item as the server sends it (CR-0006 fields included; the kind follows the key unless given). */
export const item = (key: string, over: Partial<PriceItem> = {}): PriceItem => {
  const prefix = key.split(":")[0];
  const group = GOLD_PREFIX.includes(prefix) ? "gold" : prefix === "US" ? "us" : "india";
  const category = prefix === "GOLD" ? "gold_spot" : prefix === "MCX" ? "gold_india" : prefix === "MF" ? "gold_mf" : "stock";
  const market = prefix === "BSE" ? "NSE" : prefix === "MF" ? "AMFI" : prefix;
  return {
    key, symbol: key.split(":")[1], name: key, exchange: prefix, type: "stock", currency: "INR", source: "kite",
    status: "ok", price: 4182.5, prev_close: 4172.5, change: 10, change_pct: 0.24, as_of: "2026-11-26T09:11:00Z",
    label: "Live", market_state: "open", error: null, category, group, market,
    display_name: over.name ?? key, short_name: key.split(":")[1], ...over,
  } as PriceItem;
};

export const TCS = item("NSE:TCS", { name: "Tata Consultancy Services", symbol: "TCS", short_name: "TCS" });
export const INFY = item("NSE:INFY", { name: "Infosys", symbol: "INFY", short_name: "Infosys", price: 1850, change: -5, change_pct: -0.27 });
export const EPAM = item("US:EPAM", {
  name: "EPAM Systems", symbol: "EPAM", currency: "USD", source: "finnhub", price: 185.2, change: -4.8, change_pct: -2.53, label: "Delayed 15 min",
});
export const GOLD = item("GOLD:XAU_USD", {
  name: "Gold spot", symbol: "XAU", exchange: "SPOT", currency: "USD", source: "metalcharts", price: 2650, label: "Market closed, last close",
  market_state: "closed", short_name: "Gold spot",
});
export const GOLDBEES = item("NSE:GOLDBEES", {
  name: "Nippon India ETF Gold BeES", symbol: "GOLDBEES", category: "gold_etf", group: "gold", type: "etf", price: 64.82, change: 0.31,
  change_pct: 0.48, short_name: "Gold BeES",
});
export const SGB = item("NSE:SGBJUN31I-GB", {
  name: "SGBJUN31I", symbol: "SGBJUN31I-GB", category: "gold_bond", group: "gold", type: "bond", price: 7480, change: 12, change_pct: 0.16,
  short_name: "SGBJUN31I",
});
export const GOLDM = item("MCX:GOLDM", { name: "Gold rate, India", symbol: "GOLDM", exchange: "MCX", short_name: "Gold India", price: 76840, change: 330, change_pct: 0.43 });
export const GOLDMF = item("MF:119132", {
  name: "HDFC Gold ETF Fund of Fund", symbol: "119132", exchange: "AMFI", source: "amfi", short_name: "HDFC Gold FoF", price: 27.43,
  change: 0.13, change_pct: 0.48, label: "End-of-day price", as_of: "2026-11-25T10:00:00Z",
});

export const market = (m: string, state: MarketInfo["state"], next_open_at: string | null = null, over: Partial<MarketInfo> = {}): MarketInfo => ({
  market: m, state, next_open_at, next_close_at: null, note: null, holiday: false, source: "gateway", ...over,
});

export const result = (items: PriceItem[], over: Partial<PricesResult> = {}): PricesResult => ({
  items, hidden: [], gateway: { heartbeat_at: new Date().toISOString(), paused: false }, read_at: new Date().toISOString(), ...over,
});

/** A watchlist as v0.5.0 saves it (pinned and strip given). */
export const watchlist = (keys: string[], over: Partial<Watchlist> = {}): Watchlist => ({
  keys: keys.slice(0, 10), more: keys.slice(10), pinned: keys.slice(0, 6), strip: "every", version: 2, updated_at: iso(H), ...over,
});

export const priceServer = (r: () => { status?: number; json: unknown }, extra = {}) =>
  fakeServer({ ...deviceOnly, "GET /api/market/prices": r, "POST /api/market/watch": (b) => ({ json: { watched: b.keys, refused: [] } }), ...extra });

export const reads = (calls: { method: string; path: string }[]) => calls.filter((c) => c.path === "/api/market/prices").length;

export const FRI_NSE_OPEN = "2026-11-27T03:45:00Z"; // Fri 9:15 AM IST
export const FRI_US_OPEN = "2026-11-27T14:30:00Z"; // Fri 8:00 PM IST
export const THU_8PM_IST = Date.parse("2026-11-26T14:30:00Z");
