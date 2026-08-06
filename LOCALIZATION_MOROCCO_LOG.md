- 2026-08-06 — Elections, elected mandates, and meetings completed runtime localization coverage for French, English, Arabic, and Spanish, including roles, workflow feedback, retry states, and form guidance.
# Morocco Localization Log

## 2026-08-06

- Notifications and Alerts now support runtime French, English, Arabic, and Spanish presentation across preferences, alert history, filters, grouped dates, recipients, detail metadata, and empty states.
- Arabic labels remain compatible with the app's existing RTL language flow; no notification data or permission scope is changed by the localization pass.
- Agenda payment deadlines now use locale-aware MAD formatting, while event dates and weekday/month labels use the active Morocco-compatible locale (`fr-FR`, `en-US`, `ar-MA`, or `es-ES`).
- Agenda organizer, event type, status, attendance, and export messages are available in French, English, Arabic, and Spanish without changing event persistence or permissions.
- Financial report values now use locale-aware Moroccan Dirham formatting and report periods use the active language's month/quarter presentation across French, English, Arabic, and Spanish.
- Syndical Actions now present action types, statuses, participation/support feedback, participant labels, metadata, demands, and updates in French, English, Arabic, and Spanish while preserving existing permissions.
- Governance Organigramme now formats mandate dates according to the active locale and translates national governance labels, vacancy states, role statuses, permission sections, and sharing feedback for French, English, Arabic, and Spanish.
- Charges and payment history now format MAD amounts and payment dates with the active French, English, Arabic, or Spanish locale; payment method, lot, due-date, and recovery labels are translated without changing API data or role boundaries.
- Payment-history periods now filter the visible transactions and financial summaries consistently, while invalid or unavailable transaction data remains recoverable instead of appearing as a misleading empty result.
- Financial dashboard summaries, budgets, work estimates, provider contract charges, and contract end dates now follow the active French, English, Arabic, or Spanish locale; API values, building scope, and role boundaries remain unchanged.