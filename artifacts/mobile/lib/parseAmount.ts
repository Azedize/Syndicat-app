/**
 * An amount typed by a user: « 1500,50 », « 1500.50 » or « 1 500,50 ». Null when it cannot be read
 * exactly. parseFloat("1500,50") silently gave 1500: a wrong amount is worse than an error message.
 */
export function parseAmount(text: string): number | null {
  const value = text.trim().replace(/[\s  ]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(value) ? Number(value) : null;
}
