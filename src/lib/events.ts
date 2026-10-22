export { addDays, startOfToday } from "@/lib/dates";

const NON_ZERO_AMOUNT = /[1-9]/;
const PAID_WORDS = /paid|ticket|tbc|tba|fee|delegate/i;

/**
 * Whether an event can be registered without founder approval. Deliberately
 * conservative — when in doubt it needs approval:
 * - "Free", "free entry", "0", "₹0", "INR 0" → free
 * - any non-zero amount → paid, even alongside the word free
 *   ("USD 9-99 (~Free-INR 9,999)", "Free for students, ₹500 otherwise")
 * - no price → free only if the registration note says so (legacy data
 *   keeps "Free RSVP - direct event page" there); otherwise approval.
 */
export function isFreeEvent(price: string | null, registrationStatus?: string | null): boolean {
  const text = price?.trim();
  if (text) {
    if (NON_ZERO_AMOUNT.test(text) || PAID_WORDS.test(text)) return false;
    return /free/i.test(text) || /0/.test(text);
  }
  const note = registrationStatus?.trim();
  return !!note && /free/i.test(note) && !NON_ZERO_AMOUNT.test(note) && !PAID_WORDS.test(note);
}

export const ALERT_WINDOWS = [7, 14, 30, 60] as const;

export function parseAlertWindow(value: string | string[] | undefined) {
  const n = Number(value);
  return (ALERT_WINDOWS as readonly number[]).includes(n) ? n : 14;
}
