// One locale and time zone for every rendered date. Server (Vercel runs in
// UTC, en-US) and browser (team in India) must produce identical text or
// React hydration fails — and dates should read the same for everyone.
export const APP_LOCALE = "en-IN";
export const APP_TIME_ZONE = "Asia/Kolkata";

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function formatDate(value: Date | string | number, options: Intl.DateTimeFormatOptions = DEFAULT_DATE) {
  return new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIME_ZONE, ...options }).format(new Date(value));
}

export function formatDateTime(value: Date | string | number) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}
