/**
 * The message to show when a request fails: « no connection » when the request
 * never reached the server (no HTTP status), otherwise the screen's own message.
 * A generic « Unable to submit » hid that the phone was simply offline.
 */
export function isNetworkFailure(e: unknown): boolean {
  const err = e as { status?: number; httpStatus?: number } | null;
  return !err?.status && !err?.httpStatus && e instanceof TypeError;
}

export function errorText(e: unknown, t: (key: string) => string, fallback: string): string {
  return isNetworkFailure(e) ? t("authServerError") : fallback;
}
