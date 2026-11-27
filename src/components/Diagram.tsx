import { useId } from "react";
import type { Visual } from "../types";

const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const withUnit = (v: number, unit: string) => `${fmt(v)}${unit ? ` ${unit}` : ""}`;

/** Is this diagram complete enough to draw? (Saved cards are data; a damaged one is simply not drawn.) */
export function drawable(v: Visual | null | undefined): v is Visual {
  if (!v || typeof v !== "object") return false;
  const pts = Array.isArray(v.points) ? v.points.filter((p) => typeof p?.value === "number" && Number.isFinite(p.value)) : [];
  if (v.kind === "steps") return Array.isArray(v.steps) && v.steps.length >= 2;
  if (v.kind === "change") return pts.length === 2;
  if (v.kind === "bars") return pts.length >= 2;
  if (v.kind === "trend") return pts.length >= 3;
  return false;
}

/** AC-11.6: the text version of a diagram, read out instead of the drawing. */
export function visualText(v: Visual): string {
  const head = v.title ? `${v.title}. ` : "";
  if (v.kind === "steps") return `${head}Steps: ${v.steps.map((s, i) => `${i + 1}. ${s}`).join("; ")}`;
  if (v.kind === "change") {
    const [a, b] = v.points;
    const diff = b.value - a.value;
    const pct = a.value !== 0 ? ` (${diff > 0 ? "+" : ""}${fmt((diff / Math.abs(a.value)) * 100)}%)` : "";
    return `${head}Change: from ${withUnit(a.value, v.unit)}${a.label ? ` (${a.label})` : ""} to ${withUnit(b.value, v.unit)}${b.label ? ` (${b.label})` : ""}, ${diff > 0 ? "up" : "down"} ${withUnit(Math.abs(diff), v.unit)}${pct}`;
  }
  const kind = v.kind === "trend" ? "Trend" : "Comparison";
  return `${head}${kind}: ${v.points.map((p) => `${p.label}: ${withUnit(p.value, v.unit)}`).join("; ")}`;
}

function Bars({ v, compact, grad }: { v: Visual; compact: boolean; grad: string }) {
  const pts = v.points.slice(0, compact ? 4 : 6);
  const max = Math.max(...pts.map((p) => Math.abs(p.value))) || 1;
  const row = compact ? 26 : 34;
  const barMax = compact ? 150 : 200;
  return (
    <svg viewBox={`0 0 300 ${pts.length * row}`} width="100%" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
      {pts.map((p, i) => {
        const w = Math.max(6, (Math.abs(p.value) / max) * barMax);
        return (
          <g key={i} transform={`translate(0 ${i * row})`}>
            <text x="0" y={compact ? 10 : 14} className="dg-label">{p.label.length > 26 ? p.label.slice(0, 25) + "…" : p.label}</text>
            <rect x="0" y={compact ? 14 : 19} width={barMax} height={compact ? 7 : 9} rx="4.5" className="dg-track" />
            <rect x="0" y={compact ? 14 : 19} width={w} height={compact ? 7 : 9} rx="4.5" fill={`url(#${grad})`} className="dg-bar" style={{ animationDelay: `${i * 60}ms` }} />
            <text x={barMax + 10} y={compact ? 21 : 28} className="dg-value">{fmt(p.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Change({ v, compact }: { v: Visual; compact: boolean }) {
  const [a, b] = v.points;
  const diff = b.value - a.value;
  const up = diff > 0;
  const pct = a.value !== 0 ? (diff / Math.abs(a.value)) * 100 : null;
  return (
    <div className={compact ? "dg-change compact" : "dg-change"} aria-hidden="true">
      <div className="dg-end">
        <span className="dg-cap">{a.label || "Before"}</span>
        <b className="num">{fmt(a.value)}</b>
      </div>
      <svg className={up ? "dg-arrow up" : "dg-arrow down"} viewBox="0 0 48 24" width="48" height="24">
        <path d="M2 12h40M34 4l8 8-8 8" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="dg-end">
        <span className="dg-cap">{b.label || "Now"}</span>
        <b className="num">{fmt(b.value)}</b>
      </div>
      <span className={up ? "dg-delta up" : "dg-delta down"}>
        {up ? "+" : "−"}{fmt(Math.abs(diff))}{pct !== null ? ` (${up ? "+" : "−"}${fmt(Math.abs(pct))}%)` : ""}
      </span>
    </div>
  );
}

function Trend({ v, compact, grad }: { v: Visual; compact: boolean; grad: string }) {
  const pts = v.points.slice(0, 8);
  const W = 300;
  const H = compact ? 70 : 120;
  const pad = 8;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const xy = pts.map((p, i) => [pad + (i * (W - pad * 2)) / (pts.length - 1), pad + (1 - (p.value - lo) / span) * (H - pad * 2 - 14)] as const);
  const line = xy.map(([x, y], i) => (i === 0 ? `M${x} ${y}` : `L${x} ${y}`)).join(" ");
  const area = `${line} L${xy[xy.length - 1][0]} ${H - 14} L${xy[0][0]} ${H - 14} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
      <defs>
        <linearGradient id={`${grad}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--teal)" stopOpacity=".32" />
          <stop offset="1" stopColor="var(--teal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${grad}-area)`} />
      <path d={line} fill="none" stroke={`url(#${grad})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dg-line" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 4 : 2.6} className="dg-dot" />)}
      <text x={pad} y={H - 2} className="dg-label">{pts[0].label}</text>
      <text x={W - pad} y={H - 2} textAnchor="end" className="dg-label">{pts[pts.length - 1].label}</text>
      {!compact && <text x={xy[xy.length - 1][0] - 6} y={Math.max(12, xy[xy.length - 1][1] - 8)} textAnchor="end" className="dg-value">{fmt(pts[pts.length - 1].value)}</text>}
    </svg>
  );
}

function Steps({ v, compact }: { v: Visual; compact: boolean }) {
  const steps = compact ? v.steps.slice(0, 3) : v.steps;
  return (
    <ol className={compact ? "dg-steps compact" : "dg-steps"} aria-hidden="true">
      {steps.map((s, i) => <li key={i}><span className="dg-node">{i + 1}</span><span className="dg-step">{s}</span></li>)}
      {compact && v.steps.length > 3 && <li className="dg-more">+{v.steps.length - 3} more in the post</li>}
    </ol>
  );
}

/** AC-11.5, AC-11.6: the AI's diagram, compact on a feed card and full size on the post. */
export function Diagram({ visual, compact = false }: { visual: Visual; compact?: boolean }) {
  const grad = `dg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const label = visualText(visual);
  const unit = visual.kind === "steps" ? "" : visual.unit;
  return (
    <figure className={`diagram kind-${visual.kind}${compact ? " compact" : ""}`} data-testid="diagram">
      <div role="img" aria-label={label}>
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <linearGradient id={grad} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--teal)" />
              <stop offset="1" stopColor="var(--cyan)" />
            </linearGradient>
          </defs>
        </svg>
        {visual.kind === "bars" && <Bars v={visual} compact={compact} grad={grad} />}
        {visual.kind === "change" && <Change v={visual} compact={compact} />}
        {visual.kind === "trend" && <Trend v={visual} compact={compact} grad={grad} />}
        {visual.kind === "steps" && <Steps v={visual} compact={compact} />}
      </div>
      {(!compact || visual.kind !== "steps") && (visual.title || unit) && (
        <figcaption>{visual.title}{visual.title && unit ? " · " : ""}{unit}</figcaption>
      )}
    </figure>
  );
}
