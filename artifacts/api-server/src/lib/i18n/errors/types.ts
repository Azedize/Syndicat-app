/**
 * One server error message: stable code, English and Arabic texts, and the
 * French text when the source message is not French (a few routes answer in
 * English). The key is the message exactly as the route writes it.
 */
export type ErrorEntry = readonly [code: string, en: string, ar: string, fr?: string];
export type ErrorEntries = Readonly<Record<string, ErrorEntry>>;

/** A message built with values: the pattern captures them, the texts reuse them as {1}, {2}… */
export type ErrorPattern = readonly [pattern: RegExp, code: string, fr: string, en: string, ar: string];
