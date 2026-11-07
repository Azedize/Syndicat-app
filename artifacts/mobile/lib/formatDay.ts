/** A date (YYYY-MM-DD) in the reader's language: « 7 novembre 2026 », « 7 نونبر 2026 »… */
export const formatDay = (lang: string, ymd: string | null | undefined) => {
  if (!ymd) return "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  try { return d.toLocaleDateString(lang === "ar" ? "ar-MA" : lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch { return ymd.slice(0, 10); }
};
