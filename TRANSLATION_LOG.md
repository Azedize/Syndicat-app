- 2026-08-10 — Corbeille documentaire : ajout des traductions du titre, compteur, recherche, état vide, catégories, restauration, purge, confirmations, auteur de suppression et durée de conservation en français, anglais, arabe et espagnol.
- 2026-08-10 — Bibliothèque documentaire : les dates d’historique et de commentaires suivent maintenant la langue active ; aucun nouveau libellé métier n’a été ajouté.
- 2026-08-10 — Mon Bail & Loyer : aucun nouveau libellé, mais tous les montants et dates affichés respectent désormais la locale active et le contexte marocain MAD.
- Favorites and Syndicate Setup now use runtime translations for all newly audited visible states across `fr`, `en`, `ar`, and `es`; stable API enum values and submitted payloads remain unchanged.
# 2026-08-07 — Devis & Factures

- Added four-language synchronization and unavailable-data messages for the invoice screen.
- Preserved localized invoice status, proof, creation, PDF, send, and sharing copy while routing new recovery surfaces through the runtime language system.

- 2026-08-07 — Added the complete `mdr*` translation family for the member/tenant document-request flow; no visible catalog, form, payment, review, success, or recovery copy remains French-only in that component.
# Translation Log

## 2026-08-06

- Approval workflow screen now translates visible status, priority, progress, detail, decision, document, and creation-form text for `fr`, `en`, `ar`, and `es`.
- Internal status/priority translation keys are now type-checked against the screen dictionary before rendering.
- Works and interventions action flows now translate upload errors, validation feedback, success confirmations, and input placeholders for `fr`, `en`, `ar`, and `es`.
- Payroll screen now translates titles, record counts, statistics, statuses, payment actions, confirmation dialogs, validation messages, form labels, placeholders, and feedback for `fr`, `en`, `ar`, and `es`.
- Provider management now translates provider types, filters, statistics, contract details, upload guidance, validation dialogs, form labels, placeholders, and creation feedback for `fr`, `en`, `ar`, and `es`.
- Ideas & Proposals now translates categories, statuses, pluralized counts, form labels/placeholders, decisions, empty/loading/error states, and action feedback for `fr`, `en`, `ar`, and `es`.
- National dashboard recovery messages now support `fr`, `en`, `ar`, and `es` for syndicate, ranking, and detail-data loading failures.
- Platform Support recovery and action feedback messages now support `fr`, `en`, `ar`, and `es` for ticket-list and ticket-conversation failures.
- Marketplace Moderation recovery messages now support `fr`, `en`, `ar`, and `es` for product queues, statistics, and report-loading failures.
- Document Recycle Bin loading, unavailable, retry, restore-error, and purge-error messages now support `fr`, `en`, `ar`, and `es`.
- Parking now translates vehicle, violation, and visitor-reservation labels, placeholders, statuses, alerts, confirmation feedback, and loading/recovery states for `fr`, `en`, `ar`, and `es`.
- Financial Dashboard now translates building recovery states, finance KPIs, payment tables, works and provider sections, categories, statuses, priorities, and currency units for `fr`, `en`, `ar`, and `es`.
- Buildings & Residences now translates overview metrics, filters, sort options, search/results copy, empty/recovery states, building metadata, and status labels for `fr`, `en`, `ar`, and `es`.
- Governance now translates board, commission, mandate, delegation, statute, profile, confirmation, appointment, and form copy for `fr`, `en`, `ar`, and `es`, including dynamic member and position names.
- Internal Messaging now translates message type metadata, sender/recipient fallbacks, tabs, search, empty/recovery states, acknowledgment copy, detail labels, priorities, compose fields, and send feedback for `fr`, `en`, `ar`, and `es`.
- Documents Dashboard now translates its overview, counts, lifecycle widgets, validation pipeline, retention expiry, recent-document state, status badges, and administrator actions for `fr`, `en`, `ar`, and `es`.
- Administrative Acts now translates lifecycle status/type labels, filters, detail metadata, signatory and recipient sections, PDF/share/delete actions, creation form labels/placeholders, validation feedback, and action errors for `fr`, `en`, `ar`, and `es`.
- Sinistres & Incidents now translates claim types, lifecycle statuses, urgency levels, counters, empty/loading/recovery states, declaration form labels/placeholders, and submission feedback for `fr`, `en`, `ar`, and `es`.
- Mon Lot now translates personal unit details, building metadata, charge summaries, payment statuses, tabs, quick actions, missing-unit guidance, loading/recovery states, and document guidance for `fr`, `en`, `ar`, and `es`.
- Mon Bail & Loyer now translates lease and apartment details, tenant role/status, emergency contacts, loading/recovery/no-data states, help guidance, and resident actions for `fr`, `en`, `ar`, and `es`.
- Ma Boutique now translates seller listing statuses, statistics, CRUD forms, upload guidance, promotion workflow, confirmations, validation feedback, empty/recovery states, and contact methods for `fr`, `en`, `ar`, and `es`.
- Notifications and Alerts now translate global settings, category descriptions, channels, filters, unread/read states, time buckets, recipients, detail metadata, and empty states for `fr`, `en`, `ar`, and `es`.
- Internal Chat now translates unread summaries, message actions, delete confirmations, edited/deleted states, attachment actions, download labels, and edit-mode copy for `fr`, `en`, `ar`, and `es`.
- Level-1 Support now translates ticket categories, priorities, statuses, filters, role-specific headings, empty states, detail metadata, replies, escalation controls, form placeholders, and feedback for `fr`, `en`, `ar`, and `es`.
- Agenda now translates event types, organizers, statuses, dates/countdown units, modal metadata, participation confirmation/errors, payment-deadline wording, empty states, and calendar export labels for `fr`, `en`, `ar`, and `es`.
- Financial Reports now translates KPI labels, chart titles/units, contribution states, balance labels, export summaries, periods, loading/error recovery, and sharing feedback for `fr`, `en`, `ar`, and `es`.
- Syndical Actions now translate action types, statuses, active counts, statistics, participation/support controls, metadata labels, demands, updates, and action feedback for `fr`, `en`, `ar`, and `es`.
- Governance Organigramme now translates hierarchy levels, governance statistics, national view copy, role statuses, vacancy states, permission sections, admin actions, loading/error recovery, and sharing feedback for `fr`, `en`, `ar`, and `es`.
- Travaux Privatifs now translates work types, lifecycle statuses, approval steps, decision history, statistics, resident/admin forms, placeholders, confirmations, validation, loading/recovery, and mutation feedback for `fr`, `en`, `ar`, and `es`.
- Template Studio now translates the studio header, categories, statuses, actions, confirmations, review fields, search, empty states, and safe feedback for `fr`, `en`, `ar`, and `es`.
- Template Requests now translates request categories, priorities, statuses, form/detail labels, placeholders, validation, submission feedback, locale-aware dates, and loading/error/empty states for `fr`, `en`, `ar`, and `es`.
- Super Admin National Dashboard now translates tabs, KPI labels, health and alert states, empty/recovery copy, ranking criteria, quick actions, syndicate detail metadata, member statuses, and export feedback for `fr`, `en`, `ar`, and `es`.
- General Assembly and Elections now translate the remaining dedicated resolution action, mandate roles/statuses, and governance date presentation for `fr`, `en`, `ar`, and `es`; existing lifecycle, voting, candidacy, delegation, and mandate actions remain wired to the same APIs.
- Search now translates category headings, quick suggestions, recent-search controls, quick-access shortcuts, and no-result guidance for `fr`, `en`, `ar`, and `es`.
- Subscription Payment now translates free-trial copy, billing intervals, payment methods, transfer confirmation, security guidance, amount actions, and safe recovery messages for `fr`, `en`, `ar`, and `es`.
- Signature Order and Document Wizard now translate signer roles, signature statuses, dates, category/template guidance, entity/autofill states, preview metadata, generation/signature/publication states, navigation, and recoverable errors for `fr`, `en`, `ar`, and `es`.
- Réclamations & Griefs now translate synchronization, unavailable/retryable states, submission/update failures, and anonymous display fallback for `fr`, `en`, `ar`, and `es`.
- Statistiques now translate synchronization and unavailable/retryable states; platform financial values and subscription totals follow the active locale while preserving the existing statistical labels and role scope.
- Public Welcome now translates service descriptions, hero/CTA copy, trust markers, management messaging, and the descriptive replacement for unverified proof content for `fr`, `en`, `ar`, and `es`.
- Approval Workflows retain their existing translated status, priority, category, action, loading, error, and empty-state copy while dates now follow the active locale and directional layout follows Arabic RTL.
- Level-1 Support now translates ticket synchronization recovery, conversation loading, conversation failure, and retry guidance for `fr`, `en`, `ar`, and `es`.
- Financial Reports now use the active locale for all visible revenue/expense indicator and chart number formatting; existing translated labels remain unchanged.
- Level-1 Support now routes the detail description label through the shared translation catalog and keeps all added RTL presentation behavior independent of translation content.
- Template Request Modal now translates form labels, placeholders, category and priority names, publication scope, required-field metadata, legal guidance, submission validation, success, and recovery feedback for `fr`, `en`, `ar`, and `es`.