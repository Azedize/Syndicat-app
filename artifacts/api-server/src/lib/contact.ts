/**
 * Official contact details of the platform, from configuration only:
 *   SUPPORT_EMAIL   address shown in pages and messages the API produces.
 * Not set → no contact line is printed (no invented address).
 */
const value = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);
export const platformContact = () => ({ supportEmail: value(process.env.SUPPORT_EMAIL) });
