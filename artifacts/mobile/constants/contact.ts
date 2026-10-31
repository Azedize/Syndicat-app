/**
 * Official contact details of the platform — one place, from configuration
 * (EXPO_PUBLIC_* variables, set at build time). Nothing is invented: a value
 * that is not configured is null, the screens then say so and offer no link.
 *
 *   EXPO_PUBLIC_CONTACT_EMAIL   sales / general contact
 *   EXPO_PUBLIC_SUPPORT_EMAIL   support (falls back to the contact e-mail)
 *   EXPO_PUBLIC_PRIVACY_EMAIL   data-protection contact (loi 09-08)
 *   EXPO_PUBLIC_CONTACT_PHONE   phone, international format
 *   EXPO_PUBLIC_LEGAL_ENTITY    legal name of the company operating MIZAN
 *
 * Users' own details (a syndic's phone, a neighbour's e-mail) never come from
 * here.
 */
const value = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);

export const CONTACT = {
  email: value(process.env.EXPO_PUBLIC_CONTACT_EMAIL),
  supportEmail: value(process.env.EXPO_PUBLIC_SUPPORT_EMAIL) ?? value(process.env.EXPO_PUBLIC_CONTACT_EMAIL),
  privacyEmail: value(process.env.EXPO_PUBLIC_PRIVACY_EMAIL),
  phone: value(process.env.EXPO_PUBLIC_CONTACT_PHONE),
  legalEntity: value(process.env.EXPO_PUBLIC_LEGAL_ENTITY),
} as const;
