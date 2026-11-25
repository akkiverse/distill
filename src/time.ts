export const HOUR = 3_600_000;
export const EXPIRY_MS = 24 * HOUR; // AC-6.1
export const AUTO_REFRESH_MS = 3 * HOUR; // AC-4.5

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

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** AC-4.5: refresh by itself when the last one was more than 3 hours ago (or never). */
export function refreshIsDue(lastRefreshedAt: string | null, now = Date.now()): boolean {
  if (!lastRefreshedAt) return true;
  return now - Date.parse(lastRefreshedAt) > AUTO_REFRESH_MS;
}
