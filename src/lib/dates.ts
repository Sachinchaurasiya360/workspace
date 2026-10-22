// Calendar maths in the team's time zone (Asia/Kolkata, UTC+05:30, no DST),
// independent of where the code runs — Vercel servers are UTC, browsers are
// usually IST. Pure functions, safe on server and client alike, so both
// sides agree on "today" and hydration doesn't flip.

export const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

/** IST calendar fields for an instant. */
export function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
  };
}

/** The instant IST midnight begins for the given IST calendar date (month may overflow, like Date.UTC). */
export function istMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
}

export function startOfDayIST(date: Date) {
  const { year, month, day } = istParts(date);
  return istMidnight(year, month, day);
}

export function startOfToday(now = new Date()) {
  return startOfDayIST(now);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Date-only values from <input type="date"> are stored as UTC midnight of
 * that calendar date. This is the instant that calendar day ends in IST.
 */
export function endOfDateOnly(date: Date) {
  return istMidnight(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/** Parse a YYYY-MM-DD filter value as the start / end of that day in IST. */
export function istDayStart(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return istMidnight(y!, m! - 1, d!);
}

export function istDayEnd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return istMidnight(y!, m! - 1, d! + 1);
}

/** Month key used by KpiTarget.period, e.g. "2026-09", in IST. */
export function monthKeyIST(date: Date) {
  const { year, month } = istParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function isValidDateString(value: string) {
  return !Number.isNaN(Date.parse(value));
}
