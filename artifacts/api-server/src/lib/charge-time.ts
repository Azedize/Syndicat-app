/**
 * Dates of calls for funds, in the condominiums' time zone.
 *
 * DUE-DATE RULE: a due date is a calendar day in APP_TIMEZONE (default
 * Africa/Casablanca). The obligation can be paid until the end of that day;
 * it becomes overdue on the next day, i.e. when today's local date is
 * strictly after the due date. Nothing else (no grace period, no penalty,
 * no interest) is applied automatically.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";

/** Local calendar date YYYY-MM-DD in APP_TIMEZONE (optionally at another instant). */
export function localToday(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Days after a local date (calendar arithmetic, no time zone drift). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when the due date has passed (the day after it, local time). */
export function isPastDue(dueDate: string | null | undefined, today: string = localToday()): boolean {
  return !!dueDate && dueDate < today;
}

/** Statuses of an obligation that still expects money. */
export const OPEN_CALL_STATUSES = ["pending", "partially_paid", "overdue", "rejected", "pending_validation"] as const;
