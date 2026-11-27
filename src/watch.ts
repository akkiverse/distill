/**
 * The Watchlist and pinned strip (US-10, CR-0006): the watchlist's shape and migration, the type copy, and the calm-state
 * rules that decide what the strip and the Watchlist say about closed markets.
 */
import { MAX_PINNED, MAX_WATCH, UNREACHABLE, WAITING, isOpen, marketOf } from "./markets";
import { clock, nowIso, priceTime } from "./time";
import type { Category, Group, Instrument, MarketInfo, PriceItem, PricesResult, StripSetting, Watchlist } from "./types";

export const WATCHLIST_VERSION = 2;
export const STRIP_SETTINGS: { id: StripSetting; label: string }[] = [
  { id: "every", label: "Every screen" },
  { id: "feed", label: "Feed only" },
  { id: "off", label: "Off" },
];

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
const uniq = (xs: string[]) => [...new Set(xs)];

/** Every key in order: the first 10 from `keys`, items 11 to 20 from `more`. */
export function allKeys(w: Watchlist | undefined | null): string[] {
  if (!w) return [];
  return uniq([...strings(w.keys), ...strings(w.more)]).slice(0, MAX_WATCH);
}

export const pinnedKeys = (w: Watchlist | undefined | null): string[] => upgradeWatchlist(w).pinned ?? [];
export const stripSetting = (w: Watchlist | undefined | null): StripSetting => upgradeWatchlist(w).strip ?? "every";

/**
 * The watchlist migration, version 1 (v0.4.0: keys only) to 2 (AC-10.12): the first 6 items are pinned, so the Feed keeps
 * showing them on top, and the strip is on every screen. Also tidies any copy (repeats, more than 20, pins not in the list).
 */
export function upgradeWatchlist(raw: unknown): Watchlist {
  const w = (raw && typeof raw === "object" ? raw : {}) as Partial<Watchlist>;
  const every = allKeys({ keys: strings(w.keys), more: strings(w.more), updated_at: null });
  const pins = Array.isArray(w.pinned) ? strings(w.pinned) : every.slice(0, MAX_PINNED);
  const strip: StripSetting = w.strip === "feed" || w.strip === "off" ? w.strip : "every";
  return {
    keys: every.slice(0, 10), more: every.slice(10), pinned: uniq(pins).filter((k) => every.includes(k)).slice(0, MAX_PINNED),
    strip, version: WATCHLIST_VERSION, updated_at: typeof w.updated_at === "string" ? w.updated_at : null,
  };
}

/** A changed watchlist, ready to save and sync (newer wins, so it gets the time now). */
export function changedWatchlist(old: Watchlist | undefined, change: { keys?: string[]; pinned?: string[]; strip?: StripSetting }): Watchlist {
  const base = upgradeWatchlist(old);
  const every = uniq(change.keys ?? allKeys(base)).slice(0, MAX_WATCH);
  return upgradeWatchlist({
    keys: every.slice(0, 10), more: every.slice(10), pinned: (change.pinned ?? base.pinned ?? []).filter((k) => every.includes(k)),
    strip: change.strip ?? base.strip, updated_at: nowIso(),
  });
}

/** Move `key` by one place among the keys of the same group (AC-9.11, AC-10.4). */
export function moveWithin(keys: string[], key: string, by: -1 | 1, sameGroup: (k: string) => boolean = () => true): string[] {
  const i = keys.indexOf(key);
  if (i < 0) return keys;
  let j = i + by;
  while (j >= 0 && j < keys.length && !sameGroup(keys[j])) j += by;
  if (j < 0 || j >= keys.length) return keys;
  const next = [...keys];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Drag and drop (AC-10.4): put `key` where `onto` is. */
export function moveOnto(keys: string[], key: string, onto: string): string[] {
  const from = keys.indexOf(key);
  const to = keys.indexOf(onto);
  if (from < 0 || to < 0 || from === to) return keys;
  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

// ---------- kinds and their copy (AC-10.5, AC-10.6, AC-10.7) ----------
export const GOLD_KINDS: Category[] = ["gold_india", "gold_spot", "gold_etf", "gold_bond", "gold_mf"];
export const GROUPS: { id: Group; label: string }[] = [
  { id: "gold", label: "Gold" },
  { id: "india", label: "Indian shares" },
  { id: "us", label: "US shares" },
  { id: "currency", label: "Currency" }, // AC-14.6 (added CR-0012)
];

export const KIND: Record<string, { badge: string; title: string; why: string; none?: string }> = {
  gold_india: {
    badge: "₹/10 g",
    title: "Gold rate, India",
    why: "What 10 g of 24K gold costs in India today, from MCX. Before GST.",
    // AC-10.13 (added CR-0007): say why it's missing instead of a bare "none"
    // changed CR-0012: everyone signed in can see it now, so it no longer points at the founder's account
    none: "Not in the price service right now. This rate comes from the studio's Zerodha connection, so it shows once that's signed in for the day.",
  },
  gold_spot: { badge: "Spot", title: "International gold", why: "The world price of one troy ounce (31.1 g), in US dollars." },
  gold_etf: { badge: "ETF", title: "Gold ETFs", why: "Funds on NSE that hold real gold. Bought and sold like shares." },
  gold_bond: { badge: "SGB", title: "Sovereign Gold Bonds", why: "Government bonds: 1 unit = 1 g of gold, plus 2.5% interest a year. Few trades a day." },
  gold_mf: { badge: "MF", title: "Gold mutual funds", why: "Price (NAV) once a day, after about 9 PM IST. Not traded on an exchange." },
};

type Item = Instrument & Partial<Pick<PriceItem, "as_of" | "label" | "market_state">>;

export const categoryOf = (i: Instrument): Category => i.category ?? "stock";
export const groupOf = (i: Instrument): Group => i.group ?? (i.key.startsWith("US:") ? "us" : i.key.startsWith("FX:") ? "currency" : "india");
export const isGold = (i: Instrument) => categoryOf(i).startsWith("gold");
export const nameOf = (i: Instrument) => i.display_name || i.name || i.key;
export const shortOf = (i: Instrument) => i.short_name || i.symbol || i.key;
export const marketKey = (i: Instrument) => i.market || ({ india: "NSE", us: "US", spot: "GOLD", fx: "FX" } as const)[marketOf(i.key)];

/** AC-10.1: the small type badge: ETF, SGB, MF, Spot, ₹/10 g, NSE, US, FX. */
export function badgeOf(i: Instrument): { text: string; gold: boolean } {
  const c = categoryOf(i);
  if (KIND[c]) return { text: KIND[c].badge, gold: true };
  if (c === "fx") return { text: "FX", gold: false }; // AC-14.5
  if (c === "etf") return { text: "ETF", gold: false };
  return { text: groupOf(i) === "us" ? "US" : i.exchange === "BSE" ? "BSE" : "NSE", gold: false };
}

/** The Type column on a wide screen: the gold badges, "ETF" or "Share". */
export const typeLabel = (i: Instrument) =>
  isGold(i) ? badgeOf(i).text : categoryOf(i) === "etf" ? "ETF" : categoryOf(i) === "fx" ? "Rate" : "Share";

const shortDate = (iso: string | null | undefined) => priceTime(iso).replace(/, .*$/, "");

/** The second line under an item's name in the Watchlist. */
export function subLine(i: Item): string {
  switch (categoryOf(i)) {
    case "gold_india":
      return "24K, before GST · MCX";
    case "gold_spot":
      return "XAU · $ per oz";
    case "gold_mf":
      return i.as_of ? `NAV on ${shortDate(i.as_of)}` : "NAV daily";
    case "fx":
      return "₹ per $ · ECB daily rate";
    case "gold_etf":
    case "gold_bond":
    case "etf":
      return `${i.symbol} · ${i.exchange}`;
    default:
      if (groupOf(i) === "us" && i.label && i.label.startsWith("Delayed")) return `${i.symbol} · ${i.label.toLowerCase()}`;
      return i.symbol;
  }
}

/** The second line of a search result in the Add sheet. */
export function searchLine(i: Instrument): string {
  switch (categoryOf(i)) {
    case "gold_india":
      return "₹ per 10 g · MCX";
    case "fx":
      return "₹ per US dollar · daily reference rate";
    case "gold_spot":
      return "XAU · $ per oz · weekdays";
    case "gold_mf":
      return "Gold mutual fund · NAV daily";
    default:
      return `${i.symbol} · ${i.exchange}`;
  }
}

/** AC-10.7: "What this is", in plain words. */
export function whatItIs(i: Instrument): string {
  const name = nameOf(i);
  switch (categoryOf(i)) {
    case "gold_spot":
      return "The world price of one troy ounce (31.1 g) of gold, in US dollars. It moves on weekdays as gold trades around the world.";
    case "gold_india":
      return "What 10 g of 24K gold costs in India, from the MCX Gold Mini contract. Before GST and making charges, so a jeweller's rate is higher.";
    case "gold_etf":
      return "A fund on NSE that holds physical gold. One unit follows the price of a small amount of gold, and you buy or sell it like a share during NSE hours.";
    case "gold_bond":
      return "Sovereign Gold Bond: 1 unit = 1 g of gold, 2.5% yearly interest. Issued by the Government of India and traded on NSE, often only a few times a day, so check the price time.";
    case "gold_mf":
      return "A mutual fund that invests in gold ETFs. Its price (NAV) is set once a day, after about 9 PM IST, and it isn't traded on an exchange.";
    case "fx":
      return "How many rupees one US dollar buys, from the European Central Bank's reference rate. It is set once each working day (about 8:30 PM IST) and Distill uses it to show dollar prices in rupees.";
    case "etf":
      return `${name} is a fund traded on ${i.exchange} like a share, during market hours (9:15 AM to 3:30 PM IST on weekdays).`;
    default:
      return groupOf(i) === "us"
        ? `A share of ${name}, traded in New York from 9:30 AM to 4 PM New York time (evening to early morning in India).`
        : `A share of ${name}, traded on ${i.exchange} from 9:15 AM to 3:30 PM IST on weekdays.`;
  }
}

export function sourceLabel(source: string): string {
  const names: Record<string, string> = {
    kite: "Zerodha (the studio's connection)", // changed CR-0012: shown to everyone signed in, so not "your account"
    finnhub: "Finnhub", metalcharts: "MetalCharts", amfi: "AMFI daily NAV file", frankfurter: "European Central Bank, via Frankfurter",
  };
  return names[source] ?? source;
}

export function updatesLabel(i: Instrument): string {
  const m = marketKey(i);
  if (m === "AMFI") return "Once a day, after about 9 PM IST";
  if (m === "FX") return "Once each working day";
  if (m === "MCX") return "About every 5 min in MCX hours";
  if (m === "GOLD") return "A few times a day on weekdays";
  return m === "US" ? "Every 30 s in US market hours" : "Every 30 s in NSE hours";
}

// ---------- calm states (AC-10.8, AC-10.9) ----------
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const IST_MS = 330 * 60_000;
const istDay = (ms: number) => Math.floor((ms + IST_MS) / 86_400_000);

/** "9:15 AM IST" later today, otherwise "Fri 9:15 AM IST" (Indian time). */
export function whenLabel(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso);
  const day = DAYS[new Date(ms + IST_MS).getUTCDay()];
  return istDay(ms) === istDay(now) ? `${clock(ms)} IST` : `${day} ${clock(ms)} IST`;
}

const marketName = (m: string) => (m === "GOLD" ? "Gold spot" : m);

/** "1:10 AM IST" earlier today, otherwise the full price time ("26 Nov, 2:41 PM IST"). */
const istTime = (iso: string, now: number) => (istDay(Date.parse(iso)) === istDay(now) ? `${clock(Date.parse(iso))} IST` : priceTime(iso));

/** The markets the shown items follow, from the server (calendar or its clock), or else this device's clock. */
export function watchedMarkets(result: PricesResult | null, now = Date.now()): MarketInfo[] {
  if (!result) return [];
  const wanted = [...new Set(result.items.map(marketKey))].filter((m) => m !== "AMFI" && m !== "FX"); // a rate has no hours (CR-0012)
  return wanted.map((m) => result.markets?.[m] ?? {
    market: m, state: isOpen(m === "US" ? "us" : m === "GOLD" ? "spot" : "india", now) ? "open" : "closed",
    next_open_at: null, next_close_at: null, note: null, holiday: false, source: "clock",
  });
}

export const isOpenNow = (m: MarketInfo) => m.state !== "closed";

export interface Notice {
  tone: "calm" | "amber" | "error";
  icon: "moon" | "clock" | "pause" | "calendar" | "alert";
  text: string;
  /** One line for the strip. */
  short: string;
}

function opensList(markets: MarketInfo[], now: number): string {
  // Gold spot by the clock just follows NSE and the US market; it is only named when it is the only market watched.
  const named = markets.length > 1 && markets.some((m) => m.market !== "GOLD") ? markets.filter((m) => m.market !== "GOLD" || m.source === "gateway") : markets;
  const next = named.filter((m) => m.next_open_at).sort((a, b) => Date.parse(a.next_open_at!) - Date.parse(b.next_open_at!));
  let prevDay: number | null = null;
  return next
    .map((m, i) => {
      const ms = Date.parse(m.next_open_at!);
      const when = prevDay !== null && istDay(ms) === prevDay ? `${clock(ms)} IST` : whenLabel(m.next_open_at!, now);
      prevDay = istDay(ms);
      return i === 0 ? `${marketName(m.market)} opens ${when}` : `${marketName(m.market)} at ${when}`;
    })
    .join(", ");
}

/**
 * AC-10.8: what the Watchlist and the strip say. Amber only while a watched market is open and the gateway has been quiet for
 * over 2 minutes; closed markets are normal and stay calm. `status` is how the last read went.
 */
export function priceNotices(status: string, result: PricesResult | null, now = Date.now()): Notice[] {
  if (status === "offline") {
    return [{ tone: "error", icon: "alert", text: `${UNREACHABLE}. The last prices stay until it's back.`, short: UNREACHABLE }];
  }
  if (!result || result.items.length === 0) return [];
  const markets = watchedMarkets(result, now);
  // AC-10.14 (CR-0009): the gateway reads gold spot only every few hours and is quiet on purpose when NSE, MCX and the
  // US market are all shut, so an "open" gold spot never makes a quiet gateway look paused.
  const open = markets.filter((m) => isOpenNow(m) && m.market !== "GOLD");
  const goldOpen = markets.some((m) => m.market === "GOLD" && isOpenNow(m));
  const out: Notice[] = [];
  if (result.gateway.paused && open.length > 0) {
    const names = open.map((m) => marketName(m.market)).join(" and ");
    const verb = open.length > 1 ? "are" : "is";
    const hb = result.gateway.heartbeat_at;
    const since = hb ? istTime(hb, now) : null;
    out.push(since
      ? { tone: "amber", icon: "pause", text: `Prices paused since ${since} while ${names} ${verb} open. The last prices are shown.`, short: `Prices paused since ${since}` }
      : { tone: "amber", icon: "pause", text: `Prices paused while ${names} ${verb} open: the price service hasn't checked in yet.`, short: "Prices paused" });
    return out;
  }
  const holidays = markets.filter((m) => m.holiday && m.state === "closed");
  for (const h of holidays) {
    const what = h.market === "US" ? "US market" : marketName(h.market);
    const note = h.note ? ` (${h.note})` : "";
    const opens = h.next_open_at ? ` Opens ${whenLabel(h.next_open_at, now)}.` : "";
    out.push({ tone: "calm", icon: "calendar", text: `${what} closed today for a holiday${note}.${opens}`, short: `${what} closed today for a holiday` });
  }
  const goldAt = goldOpen ? result.items.find((i) => marketKey(i) === "GOLD" && i.price !== null && i.as_of)?.as_of ?? null : null;
  const goldOnly = markets.every((m) => m.market === "GOLD");
  if (goldOnly && goldOpen) {
    // AC-10.14: only gold spot is watched; while the gateway rests, say when gold's own price is from.
    if (result.gateway.paused && goldAt) {
      const at = istTime(goldAt, now);
      out.push({ tone: "calm", icon: "clock", text: `Gold spot updates a few times a day. Price from ${at}.`, short: `Gold spot · price from ${at}` });
    }
    return out;
  }
  if (open.length === 0 && markets.length > 0) {
    const rest = markets.filter((m) => !holidays.includes(m) && !(goldOpen && m.market === "GOLD"));
    const list = opensList(rest.length ? rest : markets, now);
    const anyPrice = result.items.some((i) => i.price !== null);
    if (anyPrice) {
      const gold = goldAt ? ` Gold spot price from ${istTime(goldAt, now)}.` : "";
      out.push({ tone: "calm", icon: "moon", text: `Markets closed, prices from the last close.${list ? ` ${list}.` : ""}${gold}`, short: list ? `Markets closed · ${list}` : "Markets closed" });
    } else {
      const first = opensList(markets, now).split(", ")[0]?.replace(" opens ", " ") ?? "";
      out.push({ tone: "calm", icon: "clock", text: `Prices start when the market opens${first ? ` (${first})` : ""}.`, short: "Prices start when the market opens" });
    }
  }
  return out;
}

/** AC-9.7 (changed CR-0006): an item without a price says when its first price comes. */
export function waitingText(item: Instrument, result: PricesResult | null, now = Date.now()): string {
  const m = marketKey(item);
  if (m === "AMFI") return "First NAV after about 9 PM IST";
  if (m === "FX") return "First rate after about 8:30 PM IST on a working day";
  const info = watchedMarkets(result, now).find((x) => x.market === m);
  if (!info || isOpenNow(info) || !info.next_open_at) return WAITING;
  return `First price when ${marketName(m)} opens, ${whenLabel(info.next_open_at, now)}`;
}
