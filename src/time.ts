export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const EXPIRY_MS = 24 * HOUR; // AC-6.1
export const AUTO_REFRESH_MS = 15 * MINUTE; // AC-4.5 (changed CR-0004), AC-8.4
export const AUTO_TICK_MS = 30_000; // how often the open Feed checks whether a refresh is due (AC-8.4)

export const nowIso = (now = Date.now()) => new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// Indian time has no daylight saving, so a fixed +5:30 shift is exact and needs no time-zone data.
const IST_OFFSET_MS = 330 * MINUTE;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ist(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const time = `${h24 % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
  return { date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, time };
}

/** A clock time in Indian time, e.g. "10:42 AM". */
export function clock(ms: number): string {
  return ist(ms).time;
}

export const NO_PUBLISH_TIME = "Time not given by source"; // AC-8.2

/** AC-8.1, AC-8.2: the source's publish time in Indian time, e.g. "26 Nov 2026, 9:14 AM IST"; never a guess. */
export function publishedLabel(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return NO_PUBLISH_TIME;
  const { date, time } = ist(ms);
  return `${date}, ${time} IST`;
}

/** Whether a stored time can be read (a source's publish time is sometimes missing). */
export const hasTime = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(Date.parse(iso));

/** AC-4.5, AC-8.4: refresh by itself when the last one was 15 minutes ago or more (or never). */
export function refreshIsDue(lastRefreshedAt: string | null, now = Date.now()): boolean {
  if (!lastRefreshedAt) return true;
  return now - Date.parse(lastRefreshedAt) >= AUTO_REFRESH_MS;
}

/** A price's time in Indian time without the year, e.g. "26 Nov, 2:41 PM IST" (AC-9.4). */
export function priceTime(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return "";
  const { date, time } = ist(ms);
  return `${date.replace(/ \d{4}$/, "")}, ${time} IST`;
}
