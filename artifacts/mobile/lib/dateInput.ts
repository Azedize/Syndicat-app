/** A typed date (YYYY-MM-DD) that exists on the calendar: 2026-13-45 and 2026-02-30 are refused. */
export const isValidYmd = (v: string) => {
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};

/** A typed time of day HH:MM (24 h). */
export const isValidTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
