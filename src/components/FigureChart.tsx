import type { KeyFigure } from "../types";

/** The unit shared by 2 or more figures, if any (AC-4.2). */
export function chartUnit(figures: KeyFigure[]): string | null {
  const counts = new Map<string, number>();
  for (const f of figures) counts.set(f.unit.trim().toLowerCase(), (counts.get(f.unit.trim().toLowerCase()) ?? 0) + 1);
  let best: string | null = null;
  for (const [u, n] of counts) if (n >= 2 && (best === null || n > (counts.get(best) ?? 0))) best = u;
  return best;
}

const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** One-line text version of the figures, used as the chart's description. */
export const figuresText = (figures: KeyFigure[]) => figures.map((f) => `${f.label}: ${fmt(f.value)}${f.unit ? " " + f.unit : ""}`).join("; ");

export function Figures({ figures }: { figures: KeyFigure[] }) {
  if (!figures.length) return null;
  const unit = chartUnit(figures);
  if (unit === null) {
    return (
      <ul className="chips figures" aria-label="Key figures">
        {figures.map((f, i) => (
          <li key={i} className="chip figure-chip"><span>{f.label}</span> <strong>{fmt(f.value)}{f.unit ? ` ${f.unit}` : ""}</strong></li>
        ))}
      </ul>
    );
  }
  const shown = figures.filter((f) => f.unit.trim().toLowerCase() === unit).slice(0, 6);
  const max = Math.max(...shown.map((f) => Math.abs(f.value))) || 1;
  const label = `Chart (${shown[0].unit || "values"}): ${figuresText(shown)}`;
  return (
    <figure className="chart" data-testid="chart">
      <svg role="img" aria-label={label} viewBox={`0 0 300 ${shown.length * 34}`} width="100%" preserveAspectRatio="xMinYMin meet">
        <title>{label}</title>
        {shown.map((f, i) => {
          const w = Math.max(4, (Math.abs(f.value) / max) * 170);
          return (
            <g key={i} transform={`translate(0 ${i * 34})`}>
              <text x="0" y="15" className="chart-label">{f.label.length > 18 ? f.label.slice(0, 17) + "…" : f.label}</text>
              <rect x="0" y="20" width={w} height="8" rx="4" className="chart-bar" />
              <text x={w + 8} y="28" className="chart-value">{fmt(f.value)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>{shown[0].unit}</figcaption>
    </figure>
  );
}
