// How recent an item's status is. After a week the UI warns that it may be out of date.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const STALE_AFTER_MS = 7 * DAY;

export function timeAgo(iso: string, now = Date.now()): string {
  const age = Math.max(0, now - new Date(iso).getTime());
  if (age < MIN) return "just now";
  if (age < HOUR) return `${Math.floor(age / MIN)}m ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  return `${Math.floor(age / DAY)}d ago`;
}

export function isStale(iso: string | null, now = Date.now()): boolean {
  return iso === null || now - new Date(iso).getTime() > STALE_AFTER_MS;
}
