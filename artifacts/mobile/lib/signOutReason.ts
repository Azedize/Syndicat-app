/**
 * Why the session was closed by the server (account disabled, access to the
 * condominium withdrawn…), shown once on the sign-in screen so the person is
 * not signed out without a word.
 */
let reason: string | null = null;

export function setSignOutReason(code: string | null | undefined) {
  reason = code ?? "SESSION_EXPIRED";
}

/** Returns the reason and forgets it (shown once). */
export function takeSignOutReason(): string | null {
  const r = reason;
  reason = null;
  return r;
}
