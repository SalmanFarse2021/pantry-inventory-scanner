// Pantry presence gate, client side. The database enforces it (supabase/migrations/20261014010000_pantry_gate.sql);
// this mirror only drives the UI messages. Keep the hours, the timezone and both durations in sync with that file.

export const PANTRY_TZ = "America/Chicago";
export const CHECKIN_WINDOW_MS = 30 * 60_000;
// Check-in is refused when the pantry closes in less than this.
export const CHECKIN_CUTOFF_MS = 15 * 60_000;

// Minutes after local midnight. Days not listed are closed.
const HOURS: Record<string, { opens: number; closes: number }> = {
  Tue: { opens: 9 * 60, closes: 15 * 60 },
  Wed: { opens: 9 * 60, closes: 15 * 60 },
  Thu: { opens: 11 * 60, closes: 17 * 60 },
};

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: PANTRY_TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// Milliseconds until the pantry closes if it is open at `now`, otherwise null.
export function msUntilClose(now: Date): number | null {
  const parts = Object.fromEntries(clock.formatToParts(now).map((p) => [p.type, p.value]));
  const hours = HOURS[parts.weekday];
  if (!hours) return null;
  const secs = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  if (secs < hours.opens * 60 || secs >= hours.closes * 60) return null;
  return hours.closes * 60_000 - secs * 1000;
}

export type CheckInAvailability = "ok" | "closed" | "too_close_to_closing";

export function checkInAvailability(now: Date): CheckInAvailability {
  const left = msUntilClose(now);
  if (left === null) return "closed";
  return left < CHECKIN_CUTOFF_MS ? "too_close_to_closing" : "ok";
}

// When stock updates stop working for a check-in: 30 minutes after it, or closing time, whichever is first.
// Null when they already do not work (expired, or the pantry is closed).
export function updatesOpenUntil(checkedInAt: Date, now: Date): Date | null {
  const left = msUntilClose(now);
  if (left === null) return null;
  const end = Math.min(checkedInAt.getTime() + CHECKIN_WINDOW_MS, now.getTime() + left);
  return end > now.getTime() ? new Date(end) : null;
}

// ---------- public status line (display only; the database gate does not know about holidays) ----------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dateClock = new Intl.DateTimeFormat("en-US", {
  timeZone: PANTRY_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

// Thanksgiving (4th Thursday of November) and Christmas Day.
function isHoliday(year: number, month: number, day: number): boolean {
  if (month === 12 && day === 25) return true;
  if (month !== 11) return false;
  const firstThu = 1 + ((4 - new Date(Date.UTC(year, 10, 1)).getUTCDay() + 7) % 7);
  return day === firstThu + 21;
}

function formatHour(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export type PantryStatus = { open: boolean; detail: string };

// "Open - 9 AM to 3 PM" while open, otherwise when the pantry next opens.
export function pantryStatus(now: Date): PantryStatus {
  const p = Object.fromEntries(dateClock.formatToParts(now).map((x) => [x.type, Number(x.value)]));
  const nowMins = p.hour * 60 + p.minute;
  for (let offset = 0; offset < 15; offset++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + offset));
    const hours = HOURS[WEEKDAYS[d.getUTCDay()]];
    if (!hours || isHoliday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())) continue;
    const range = `${formatHour(hours.opens)} to ${formatHour(hours.closes)}`;
    if (offset === 0) {
      if (nowMins >= hours.closes) continue;
      if (nowMins >= hours.opens) return { open: true, detail: range };
    }
    const when =
      offset === 0 ? "today" : offset === 1 ? "tomorrow" : `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    return { open: false, detail: `Open ${when} ${range}` };
  }
  return { open: false, detail: "Check back soon for hours" };
}
