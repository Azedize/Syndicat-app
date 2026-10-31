/**
 * Whether an e-mail address can receive mail.
 *
 * Reserved names never resolve to a mailbox (RFC 2606, RFC 6761): the
 * ".test", ".invalid", ".example", ".localhost" top-level domains and the
 * example.com / .net / .org domains. Generated test accounts use them on
 * purpose so that no real person is ever written to.
 */
const RESERVED_TLD = /(^|\.)(test|invalid|example|localhost|local)$/;
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

export type EmailStatus = "unverified" | "verified" | "undeliverable";

export function emailDomain(email: string): string {
  return (email.split("@")[1] ?? "").trim().toLowerCase();
}

export function isReservedEmail(email: string): boolean {
  const domain = emailDomain(email);
  return !domain || RESERVED_TLD.test(domain) || RESERVED_DOMAINS.has(domain);
}

/** Status a new account starts with. */
export function initialEmailStatus(email: string, verified = false): EmailStatus {
  if (isReservedEmail(email)) return "undeliverable";
  return verified ? "verified" : "unverified";
}

/**
 * In production an account must be created with an address that can receive
 * mail (invitations, receipts, password resets). Development and test
 * environments keep accepting reserved domains — they are how test accounts
 * avoid writing to real people — and mark them undeliverable instead.
 */
export function reservedEmailRefused(email: string): boolean {
  return process.env.NODE_ENV === "production" && isReservedEmail(email);
}

export const RESERVED_EMAIL_ERROR = {
  error: "Cette adresse e-mail ne peut pas recevoir de messages (domaine réservé). Indiquez une adresse réelle.",
  code: "EMAIL_UNDELIVERABLE",
} as const;
