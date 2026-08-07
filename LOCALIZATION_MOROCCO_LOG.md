# 2026-08-07 — Invoice localization pass

- Invoice MAD values now use locale-aware `Intl.NumberFormat` presentation for `fr-FR`, `en-US`, `ar-MA`, and `es-ES`.
- Invoice issue and due dates now use the active locale, and loading/unavailable recovery copy is translated across all enabled languages.

- 2026-08-07 — Added French/English/Arabic/Spanish runtime coverage for resident document requests, including locale-aware MAD eligibility totals and Moroccan co-ownership vocabulary.
- 2026-08-06 — Elections, elected mandates, and meetings completed runtime localization coverage for French, English, Arabic, and Spanish, including roles, workflow feedback, retry states, and form guidance.
- 2026-08-06 — Assemblée Générale completed runtime localization coverage for lifecycle feedback, loading/retry states, quorum and resolution forms, vote registration, attendance, and minutes generation in French, English, Arabic, and Spanish.
- 2026-08-06 — Charges & Fund Calls completed safe localized recovery coverage for payment submission, payment validation, and payment rejection in French, English, Arabic, and Spanish.
- 2026-08-06 — Invoices completed safe localized recovery coverage for proof upload, invoice/quote creation, PDF generation, and document sending in French, English, Arabic, and Spanish.
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
- National platform supervision now formats syndicate/member counts, national balances, syndicate balances, and report dates with the active French, English, Arabic, or Spanish locale; MAD remains the displayed currency and API values remain unchanged.
- General Assembly and Elections now format date ranges, meeting dates/times, mandate end dates, mandate roles, and mandate lifecycle statuses using the active French, English, Arabic, or Spanish locale while preserving Moroccan governance semantics and API values.
- Search discovery surfaces now use runtime French, English, Arabic, and Spanish labels for categories, suggestions, history, shortcuts, and no-result recovery.
- Subscription onboarding now uses runtime French, English, Arabic, and Spanish copy for free trials, billing intervals, payment methods, transfer confirmation, security guidance, and safe recovery; amounts use Morocco-compatible locale formatting and Arabic MAD notation.
- Documents & Signatures now use runtime French, English, Arabic, and Spanish copy for document counts, generation, preview/download outcomes, electronic signatures, workflow decisions, archive/delete confirmations, comments, version history, QR verification, bundle packages, and document editing.
- Arabic document actions remain compatible with the existing RTL language flow; no API payload, signature data, PDF storage behavior, or role scope changed during this pass.
- Signature review and document creation now use runtime French, English, Arabic, and Spanish labels for signer roles, lifecycle statuses, dates, loading/retry states, and signing actions.
- The seven-step document wizard now localizes category guidance, template/entity states, database-resolved values, preview metadata, generation feedback, signature safeguards, publication confirmation, and navigation while preserving Moroccan document workflows and RTL compatibility.
- Lots and Tenant Administration now localize unit types, tenant statuses, lease dates, expiry countdowns, rent/deposit/charge amounts, and mutation recovery across French, English, Arabic, and Spanish; MAD values use locale-aware currency formatting.
- Delivery Notes now localize incoming/outgoing labels, lifecycle statuses, confirmation/PDF feedback, form guidance, empty-state copy, dates, and MAD totals across French, English, Arabic, and Spanish.
- My Orders now localize order lifecycle labels, purchase/sales tabs, seller/buyer metadata, confirmation/review actions, empty and unavailable states, dates, and full MAD totals across French, English, Arabic, and Spanish.
- User Management now localizes account roles, statuses, synchronization/recovery feedback, validation guidance, membership dates, and administrative actions across French, English, Arabic, and Spanish; Moroccan phone input accepts the national and +212 formats.
- Réclamations & Griefs now keeps all recovery and mutation feedback in the active French, English, Arabic, or Spanish locale, with RTL-aware back navigation.
- Statistiques now formats platform KPIs and persisted SaaS subscription totals with the active French, English, Arabic, or Spanish locale while retaining MAD as the displayed currency.
- Public Welcome now localizes its service descriptions, hero, trust markers, management messaging, CTA, and RTL-aware header direction across French, English, Arabic, and Spanish.