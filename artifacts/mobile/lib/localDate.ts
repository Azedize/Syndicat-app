/**
 * Calendar date YYYY-MM-DD in the phone's time zone. `toISOString()` gives the
 * UTC date, which in Morocco (UTC+1) is still the previous day until 1 a.m.
 */
export function localDate(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
