/**
 * Rupees first and trend graphs (US-14, CR-0012): the price as shown everywhere (rupees first, dollars in brackets), the
 * change with its arrow, the small line graph of today's price, and the bigger graph with 1D, 1W and 1M on an item's detail.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { direction, money } from "../markets";
import { usePrices } from "../prices";
import { NO_RATE, inShownCurrency, rateText, shown } from "../rupees";
import { priceTime } from "../time";
import type { HistoryPoint, HistoryRange, PriceItem } from "../types";

type Dir = "up" | "down" | "flat";

/** AC-14.7: the arrow, up or down since yesterday's close (nothing when unchanged). */
export function Arrow({ dir, size = 12 }: { dir: Dir; size?: number }) {
  if (dir === "flat") return null;
  return (
    <svg className={`arrow ${dir}`} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d={dir === "up" ? "M6 2.2 10.4 8.6H1.6Z" : "M6 9.8 1.6 3.4H10.4Z"} fill="currentColor" />
    </svg>
  );
}

const dirOf = (it: PriceItem): Dir => direction(shown(it)?.delta ?? it.change) as Dir;

/** AC-14.1, AC-14.2, AC-14.4: "₹15,221.69 ($164.63)"; the rate and its time on hover (title) or tap (the detail line). */
export function PriceText({ it, usdClass = "usd", showNoRate = true }: { it: PriceItem; usdClass?: string; showNoRate?: boolean }) {
  const { result } = usePrices();
  const s = shown(it);
  if (!s) return null;
  const rate = s.usd ? rateText(result?.fx) : null;
  return (
    <span className="price-text" title={rate ?? undefined}>
      <span className="pt-main">{s.main}</span>
      {s.usd && <span className={usdClass}> {s.usd}</span>}
      {s.noRate && showNoRate && <span className="no-rate"> {NO_RATE}</span>}
    </span>
  );
}

/** AC-14.7: the arrow and the change since yesterday's close, in the currency shown first. */
export function ChangeText({ it, pctOnly = false }: { it: PriceItem; pctOnly?: boolean }) {
  const s = shown(it);
  if (!s || s.change === null) return null;
  const dir = dirOf(it);
  const text = pctOnly && it.change_pct !== null ? s.change.replace(/^.*\(|\)$/g, "") : s.change;
  return (
    <span className={`change ${dir}`}>
      <Arrow dir={dir} />
      <span>{text}</span>
    </span>
  );
}

/** The SVG path for a line through `points`, scaled into `w` by `h` (with a little room top and bottom). */
export function linePath(points: HistoryPoint[], w: number, h: number, lo?: number, hi?: number): string {
  if (points.length === 0) return "";
  const t0 = Date.parse(points[0].at);
  const t1 = Date.parse(points[points.length - 1].at);
  const prices = points.map((p) => p.price);
  const min = lo ?? Math.min(...prices);
  const max = hi ?? Math.max(...prices);
  const pad = h * 0.08;
  const x = (t: number) => (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w);
  const y = (v: number) => (max === min ? h / 2 : pad + (1 - (v - min) / (max - min)) * (h - 2 * pad));
  if (points.length === 1) return `M0 ${y(points[0].price).toFixed(1)}H${w}`;
  return points.map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.at)).toFixed(1)} ${y(p.price).toFixed(1)}`).join("");
}

/**
 * AC-14.7: the small graph of today's price: green when up since yesterday's close, red when down. Nothing at all when
 * there is no history yet (a new item, or a market that hasn't opened today): the arrow and change are shown alone.
 */
export function Spark({ it, width = 64, height = 22 }: { it: PriceItem; width?: number; height?: number }) {
  const { today } = usePrices();
  const pts = inShownCurrency(today(it.key), it);
  if (pts.length < 2) return null;
  const dir = dirOf(it);
  return (
    <svg className={`spark ${dir}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Today: ${dir === "up" ? "up" : dir === "down" ? "down" : "unchanged"} since yesterday's close`} data-testid="spark">
      <path d={linePath(pts, width, height)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const RANGES: { id: HistoryRange; label: string; long: string }[] = [
  { id: "1d", label: "1D", long: "today" },
  { id: "1w", label: "1W", long: "the last week" },
  { id: "1m", label: "1M", long: "the last month" },
];

const shortTime = (iso: string, range: HistoryRange) => {
  const t = priceTime(iso); // "26 Nov, 2:41 PM IST"
  return range === "1d" ? t.replace(/^.*?, /, "") : t.replace(/, .*$/, "");
};

/** AC-14.8: the bigger graph on an item's detail, with 1D, 1W and 1M. */
export function TrendChart({ it }: { it: PriceItem }) {
  const { today, historyAvailable } = usePrices();
  const [range, setRange] = useState<HistoryRange>("1d");
  const [loaded, setLoaded] = useState<Partial<Record<HistoryRange, { points: HistoryPoint[]; available: boolean }>>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (range === "1d" || loaded[range]) return;
    let alive = true;
    setFailed(false);
    api.marketHistory([it.key], range).then(
      (r) => alive && setLoaded((m) => ({ ...m, [range]: { points: r.series[it.key] ?? [], available: r.available } })),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [range, it.key, loaded]);

  const raw = range === "1d" ? today(it.key) : loaded[range]?.points;
  const available = range === "1d" ? historyAvailable || raw !== undefined : loaded[range]?.available ?? true;
  const pts = useMemo(() => inShownCurrency(raw, it), [raw, it]);
  const s = shown(it);
  const prevClose = it.price_inr != null ? it.prev_close_inr ?? null : it.prev_close;

  let body: ReactNode;
  if (range !== "1d" && failed) body = <p className="chart-empty">The graph can't be loaded right now. Try again in a moment.</p>;
  else if (range !== "1d" && !loaded[range]) body = <p className="chart-empty" aria-busy="true">Loading the graph…</p>;
  else if (!available) body = <p className="chart-empty">Price graphs start once the price service keeps a history.</p>;
  else if (pts.length < 2) {
    body = (
      <p className="chart-empty">
        {range === "1d" ? "No graph yet today. It fills in while the market is open." : "Not enough prices yet for this graph."}
      </p>
    );
  } else {
    const W = 600;
    const H = 180;
    const prices = pts.map((p) => p.price);
    const withPrev = range === "1d" && prevClose !== null ? [...prices, prevClose] : prices;
    const lo = Math.min(...withPrev);
    const hi = Math.max(...withPrev);
    const first = pts[0].price;
    const last = pts[pts.length - 1].price;
    const dir: Dir = range === "1d" ? dirOf(it) : (direction(last - first) as Dir);
    const line = linePath(pts, W, H, lo, hi);
    const pad = H * 0.08;
    const prevY = prevClose !== null && hi !== lo ? pad + (1 - (prevClose - lo) / (hi - lo)) * (H - 2 * pad) : null;
    const cur = s?.usd ? "INR" : it.currency;
    const label = `Price over ${RANGES.find((r) => r.id === range)!.long}: from ${money(first, cur)} to ${money(last, cur)}, low ${money(Math.min(...prices), cur)}, high ${money(Math.max(...prices), cur)}.`;
    body = (
      <figure className={`chart ${dir}`}>
        <div className="chart-scale" aria-hidden="true">
          <span>{money(Math.max(...prices), cur)}</span>
          <span>{money(Math.min(...prices), cur)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} data-testid="trend-chart">
          <path d={`${line}L${W} ${H}L0 ${H}Z`} className="chart-area" />
          {range === "1d" && prevY !== null && <line x1="0" x2={W} y1={prevY} y2={prevY} className="chart-prev" />}
          <path d={line} className="chart-line" fill="none" />
        </svg>
        <figcaption className="chart-axis">
          <span>{shortTime(pts[0].at, range)}</span>
          {range === "1d" && prevY !== null && <span className="chart-key"><span className="dash" aria-hidden="true" /> Yesterday's close</span>}
          <span>{shortTime(pts[pts.length - 1].at, range)}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <section className="box trend" aria-labelledby="trend-title">
      <div className="trend-head">
        <h2 id="trend-title" className="box-title">Price trend</h2>
        <div className="seg seg-sm" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>
      {body}
    </section>
  );
}
