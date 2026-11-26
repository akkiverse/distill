import { DISCLAIMER } from "../markets";
import type { Instrument, PricesResult } from "../types";
import { badgeOf, type Notice } from "../watch";
import { IconAlert, IconCalendar, IconClock, IconMoon, IconPause } from "./Icons";

/** AC-10.1: the small type badge; gold kinds in the gold colour. */
export function Badge({ item }: { item: Instrument }) {
  const b = badgeOf(item);
  return <span className={`badge${b.gold ? " gold" : ""}`}>{b.text}</span>;
}

const ICONS = { moon: IconMoon, clock: IconClock, pause: IconPause, calendar: IconCalendar, alert: IconAlert };

/** AC-10.8: a calm (or, when something is wrong, amber or red) message about the prices. */
export function NoticeView({ notice }: { notice: Notice }) {
  const Icon = ICONS[notice.icon];
  return (
    <p className={`note price-note ${notice.tone}`} role="status">
      <Icon width={18} height={18} />
      <span>{notice.text}</span>
    </p>
  );
}

/** AC-9.14, AC-10.7: the information-only note, with the MetalCharts credit when a gold spot price is shown. */
export function Disclaimer({ result }: { result: PricesResult | null }) {
  const gold = (result?.items ?? []).some((i) => i.source === "metalcharts" && i.price !== null);
  return (
    <p className="muted small disclaimer">
      {DISCLAIMER}
      {gold && <> Gold spot prices by <a href="https://metalcharts.org" target="_blank" rel="noreferrer">MetalCharts</a>.</>}
    </p>
  );
}
