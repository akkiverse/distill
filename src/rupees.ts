/**
 * Rupees first (US-14, CR-0012): every price in rupees, with a US-dollar price in brackets after it, at the Market
 * Gateway's USD to INR rate. Without a rate a dollar price shows alone, as before, with "₹ rate not available".
 */
import { MINUS, changeText, money } from "./markets";
import { clock, priceTime } from "./time";
import type { FxRate, HistoryPoint, PriceItem } from "./types";

export const NO_RATE = "₹ rate not available"; // AC-14.4

export interface Shown {
  /** The price to show first: rupees when there is a rate or the item is Indian, else the dollar price. */
  main: string;
  /** The dollar price in brackets, "($164.63)", for a dollar item shown in rupees. */
  usd: string | null;
  /** A dollar item without a rate (AC-14.4). */
  noRate: boolean;
  /** The change since the previous close, in the currency shown first, with the %, e.g. "+₹428.09 (+2.89%)". */
  change: string | null;
  /** The plain change in the currency shown first, for the sign and the colour. */
  delta: number | null;
}

const isUsd = (it: Pick<PriceItem, "currency">) => it.currency.toUpperCase() === "USD";

/** The rate the item's rupee price uses, or null (an Indian item needs none). */
export function inrRate(it: PriceItem): number | null {
  if (!isUsd(it) || it.price === null || it.price === 0 || it.price_inr == null) return null;
  return it.price_inr / it.price;
}

/** AC-14.1, AC-14.4: what to show for an item's price and change. */
export function shown(it: PriceItem): Shown | null {
  if (it.price === null) return null;
  if (isUsd(it) && it.price_inr != null) {
    const delta = it.change_inr ?? null;
    return {
      main: money(it.price_inr, "INR"), usd: `(${money(it.price, "USD")})`, noRate: false, delta,
      change: delta === null ? null : rupeeChange(delta, it.change_pct),
    };
  }
  const inr = it.currency.toUpperCase() === "INR";
  const delta = it.change;
  return {
    main: money(it.price, it.currency), usd: null, noRate: isUsd(it), delta,
    change: delta === null ? null : inr ? rupeeChange(delta, it.change_pct) : changeText(delta, it.change_pct),
  };
}

/** "+₹428.09 (+2.89%)", "−₹12.40 (−0.47%)", in Indian digit grouping. */
export function rupeeChange(delta: number, pct: number | null): string {
  const text = changeText(delta, pct, "en-IN");
  const sign = text.startsWith("+") || text.startsWith(MINUS) ? text[0] : "";
  return `${sign}₹${text.slice(sign.length)}`;
}

const IST_MS = 330 * 60_000;
const istDay = (ms: number) => Math.floor((ms + IST_MS) / 86_400_000);

/** AC-14.2: "₹/$ 92.46 at 8:30 PM IST" (today) or "₹/$ 92.46 at 24 Nov, 8:30 PM IST". */
export function rateText(fx: FxRate | null | undefined, now = Date.now()): string | null {
  if (!fx) return null;
  const rate = fx.rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!fx.as_of) return `₹/$ ${rate}`;
  const ms = Date.parse(fx.as_of);
  const when = istDay(ms) === istDay(now) ? `${clock(ms)} IST` : priceTime(fx.as_of);
  return `₹/$ ${rate} at ${when}`;
}

/** The history in the currency shown first: a dollar item's points in rupees at today's rate (the line's shape is the same). */
export function inShownCurrency(points: HistoryPoint[] | undefined, it: PriceItem): HistoryPoint[] {
  const rate = inrRate(it);
  const list = points ?? [];
  return rate === null ? list : list.map((p) => ({ at: p.at, price: p.price * rate }));
}
