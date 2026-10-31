/**
 * The e-mail domain of every synthetic account (generator, tests).
 *
 * One place: `TEST_EMAIL_ROOT` (default `seedgen.mizan.test`). A run's
 * accounts are `<prénom.nom.N>@s<seed>.<root>`; tests find them with
 * `LIKE '%.<root>'`.
 *
 * The root must end with a TLD reserved by RFC 2606 / 6761 (.test, .invalid,
 * .example, .localhost): those domains can never receive mail, so a test can
 * never write to a real person. Such an address is syntactically valid but is
 * NOT a verified mailbox — the API marks it `undeliverable` and skips sending.
 * A scenario that needs a real inbox must use a controlled test mailbox or an
 * SMTP sandbox, configured separately; it is not done by changing this root.
 */
const RESERVED_TLDS = [".test", ".invalid", ".example", ".localhost"];

export function testEmailRoot(): string {
  const root = (process.env.TEST_EMAIL_ROOT ?? "seedgen.mizan.test").trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(root)) throw new Error(`TEST_EMAIL_ROOT invalide : « ${root} »`);
  if (!RESERVED_TLDS.some((tld) => root.endsWith(tld))) {
    throw new Error(`TEST_EMAIL_ROOT « ${root} » n'est pas un domaine réservé aux tests (${RESERVED_TLDS.join(", ")}) : refusé pour ne jamais écrire à une vraie boîte.`);
  }
  return root;
}

export const TEST_EMAIL_ROOT = testEmailRoot();
/** SQL LIKE pattern matching every synthetic account. */
export const TEST_EMAIL_LIKE = `%.${TEST_EMAIL_ROOT}`;

/**
 * SQL condition: the condominium `alias` can be written to — the API's rules
 * (requireActiveSubscription, enforceSessionContext): a trial, active or
 * grace period not yet ended, and a syndic company that is not suspended
 * (a suspended company puts its condominiums in read-only).
 */
export const writableSubscriptionSql = (alias = "s") => `EXISTS (SELECT 1 FROM syndicate_subscriptions ws WHERE ws.syndicate_id = ${alias}.id AND (
  (ws.status = 'trial' AND ws.trial_end_date >= now()) OR
  (ws.status = 'active' AND (ws.current_period_end IS NULL OR ws.current_period_end >= now())) OR
  (ws.status = 'grace' AND ws.grace_period_end >= now())))
  AND NOT EXISTS (SELECT 1 FROM organizations wo WHERE wo.id = ${alias}.organization_id AND wo.status = 'suspended')`;
