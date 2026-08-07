# 2026-08-07 — Financial document state language

- Extended the shared enterprise state vocabulary to the invoice module with contextual synchronization and unavailable-data recovery.
- Reused the product's active-locale financial/date presentation conventions so financial summaries and document metadata remain coherent across French, English, Arabic, and Spanish.

- 2026-08-07 — Extended shared runtime language coverage to the resident document-request component; financial eligibility values now use the active locale and MAD currency presentation.
- Ma Boutique reuses semantic theme colors and shared DataState components while keeping seller actions, status pills, promotion feedback, and MAD/date presentation consistent across light/dark and supported languages.
# Design System Log

## 2026-08-06

- Internal Messaging adopted the shared runtime translation, loading, retry, and empty-state components while preserving the existing theme colors, touch targets, and modal interaction patterns.
- Documents Dashboard adopted shared translation keys for all dashboard presentation copy while preserving its existing theme, role visibility, status colors, and touch interactions.
- Administrative Acts adopted shared translation keys and shared data-state components while preserving its existing document status colors, role visibility, modal structure, and touch targets.
- Sinistres & Incidents adopted shared translation keys and shared loading/retry components while preserving its severity/status color system, modal interaction pattern, and role-scoped access.
- Mon Lot adopted shared translation keys and shared dependency-specific recovery components while preserving its unit/charge color semantics, tab structure, payment CTA, and support actions.
- Mon Bail & Loyer adopted shared translation keys and shared loading/retry components while preserving its lease status colors, tenant card, information hierarchy, tenant-only visibility, and contact actions.
- Notifications reuse the semantic alert colors, shared card treatments, channel controls, and existing touch targets while translating all supporting labels and state copy at runtime.
- Internal Chat reuses the existing message action hierarchy, attachment controls, and shared typography while replacing visible fallback copy with runtime translations.
- Level-1 Support reuses the existing semantic priority/status colors, card surfaces, filter pills, modal layout, and action hierarchy while translating labels and feedback at runtime.
- Agenda reuses the existing event color/icon hierarchy, timeline cards, modal detail treatment, and touch actions while applying runtime translations, locale-aware date/currency formatting, and explicit failure feedback.
- Financial Reports reuses the existing KPI, chart, breakdown, balance, and export hierarchy while applying semantic shared loading/error states, translated labels, locale-aware periods, and consistent MAD formatting.
- Syndical Actions reuses the existing type/status colors, support and participation button hierarchy, metadata cards, modal sections, and optimistic interaction patterns while translating visible copy at runtime.
- Governance Organigramme reuses its role-color hierarchy, mandate badges, national summary cards, permission sections, and administrative action hierarchy while adding shared data states, localized dates, and translated feedback.
- Template Studio and Template Requests reuse existing category/status/priority semantic colors, card and modal surfaces, touch targets, and role boundaries while adopting shared runtime translations and DataState recovery components.
- Super Admin National Dashboard reuses semantic health/alert colors, ranking podium accents, KPI cards, detail surfaces, and export actions while applying four-language labels and active-locale MAD/date formatting.
- Assemblée Générale and Élections preserve their existing semantic status colors, card/modal surfaces, lifecycle controls, and mandate/result hierarchy while applying the shared four-language runtime and locale-aware date formatting.
- Documents & Signatures reuse the existing semantic document colors, status chips, step indicator, entity cards, signature safeguards, and publication actions while applying consistent four-language copy and recoverable state presentation.
- Réclamations & Griefs reuses the existing status/severity hierarchy, filters, detail sheet, and mutation controls while adding shared loading/error recovery, localized feedback, and RTL-aware navigation.
- Statistiques reuses the existing KPI, chart, plan breakdown, and export hierarchy while adding explicit synchronization recovery, active-locale MAD formatting, persisted plan totals, and RTL-aware navigation.
- Profile onboarding reuses its progressive step, avatar preview, and summary hierarchy while applying shared runtime language metadata to the complete journey.
 - Marketplace cart reuses its order summary and checkout hierarchy while applying shared semantic feedback, active-locale MAD formatting, and four-language payment guidance.
 - Public Welcome reuses the established MIZAN blue/navy visual language and touch hierarchy while applying shared translation keys and removing unverified proof visuals from the public surface.