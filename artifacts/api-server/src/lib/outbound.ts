/**
 * Outbound delivery switch. `OUTBOUND_DELIVERY=off` stops every message that
 * would leave the machine — e-mails (SMTP) and SMS (ZimSend) — whatever the
 * provider settings in .env. Test APIs start with it: the automated suites
 * create accounts, reset passwords and send notifications, and must never
 * write to a real person. A stopped message is logged as « skipped » with the
 * reason; it is never reported as delivered.
 */
export function outboundDeliveryDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OUTBOUND_DELIVERY === "off";
}

export const OUTBOUND_DISABLED_REASON = "Envoi désactivé (OUTBOUND_DELIVERY=off — environnement de test)";
