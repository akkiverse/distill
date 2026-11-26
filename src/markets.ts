/** Prices (US-9, CR-0005): market hours, refresh timing and how prices are written. */
import type { Card } from "./types";

export const MAX_WATCH = 10; // AC-9.2
export const OPEN_EVERY_MS = 30_000; // AC-9.9: while any item's market is open
export const CLOSED_EVERY_MS = 15 * 60_000; // AC-9.9: otherwise
export const TOO_MANY = `You can watch up to ${MAX_WATCH} items`;
export const NOT_SET_UP = "Price source not set up yet"; // AC-9.10
export const UNREACHABLE = "Prices can't be reached right now"; // AC-9.10
export const WAITING = "Waiting for the first price"; // AC-9.7
export const MARKETS_CLOSED = "Markets closed, prices from the last close"; // AC-9.15
export const DISCLAIMER = "For information only. Not investment advice. Prices may be delayed."; // AC-9.14

export type Market = "india" | "us" | "spot";

/** Which market a key trades on, from its prefix (the contract's keys: NSE:TCS, US:EPAM, GOLD:XAU_USD). */
export function marketOf(key: string): Market {
  const p = key.split(":")[0].toUpperCase();
  if (p === "NSE" || p === "BSE") return "india";
  if (p === "US") return "us";
  return "spot"; // gold spot and other commodities
}

function partsIn(timeZone: string, now: number) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(f.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday as string, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const weekday = (d: string) => d !== "Sat" && d !== "Sun";

/**
 * AC-9.9: NSE and BSE 9:15 AM to 3:30 PM IST on weekdays; US 9:30 AM to 4 PM New York time on weekdays (daylight saving
 * from the time-zone data); gold spot on weekdays (Indian time). Exchange holidays are not known here: on a holiday the
 * list just reads every 30 seconds and shows "Market closed, last close" from the gateway.
 */
export function isOpen(market: Market, now = Date.now()): boolean {
  if (market === "india") {
    const { weekday: d, minutes } = partsIn("Asia/Kolkata", now);
    return weekday(d) && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
  }
  if (market === "us") {
    const { weekday: d, minutes } = partsIn("America/New_York", now);
    return weekday(d) && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  }
  return weekday(partsIn("Asia/Kolkata", now).weekday);
}

/**
 * AC-9.15: the gateway is quiet only because the markets are shut: every watched item's last price says closed, and
 * by the clock none of their markets is open now. If either disagrees, a quiet gateway still means "Prices paused".
 */
export function quietBecauseClosed(keys: string[], marketsClosed: boolean | undefined, now = Date.now()): boolean {
  return Boolean(marketsClosed) && keys.length > 0 && !keys.some((k) => isOpen(marketOf(k), now));
}

/** AC-9.9: how long until the next read of the list. */
export function refreshEvery(keys: string[], now = Date.now()): number {
  return keys.some((k) => isOpen(marketOf(k), now)) ? OPEN_EVERY_MS : CLOSED_EVERY_MS;
}

const fixed2 = (n: number, locale: string) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** AC-9.4: "Rs 4,182.50", "$185.20". */
export function money(value: number, currency: string): string {
  const c = currency.toUpperCase();
  if (c === "INR") return `Rs ${fixed2(value, "en-IN")}`;
  if (c === "USD") return `$${fixed2(value, "en-US")}`;
  return `${c} ${fixed2(value, "en-US")}`;
}

/** AC-9.4: "+10.00 (+0.24%)" or "-4.80 (-2.53%)". */
export function changeText(change: number, pct: number | null): string {
  const sign = change > 0 ? "+" : change < 0 ? "-" : "";
  const abs = fixed2(Math.abs(change), "en-US");
  if (pct === null) return `${sign}${abs}`;
  return `${sign}${abs} (${sign}${fixed2(Math.abs(pct), "en-US")}%)`;
}

export const direction = (change: number | null) => (change === null || change === 0 ? "flat" : change > 0 ? "up" : "down");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** AC-9.12: news cards that mention the item's symbol or name, newest first. */
export function cardsMentioning(cards: Card[], symbol: string, name: string): Card[] {
  const words = [symbol, name].map((w) => w.trim()).filter((w) => w.length >= 3);
  if (words.length === 0) return [];
  const re = new RegExp(`(^|[^A-Za-z0-9])(${words.map(escape).join("|")})(?![A-Za-z0-9])`, "i");
  return cards
    .filter((c) => re.test([c.title, c.summary, ...c.key_points].join(" ")))
    .sort((a, b) => Date.parse(b.published_at ?? b.fetched_at) - Date.parse(a.published_at ?? a.fetched_at));
}
