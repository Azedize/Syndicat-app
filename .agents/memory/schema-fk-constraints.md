---
name: Schema FK constraints strategy
description: How FK .references() calls were added to schema.ts without circular dependencies
---

## Rule
Add `.references()` to FK columns in lib/db/src/schema.ts. Avoid circular dependency pairs where table A references table B and table B references table A — Drizzle will fail at schema initialization.

## Known circular pair to avoid
`syndicatesTable.adminId → usersTable` AND `usersTable.syndicateId → syndicatesTable` — these create a circular reference. The resolution: `usersTable.syndicateId` has `.references(() => syndicatesTable.id, { onDelete: "set null" })`, but `syndicatesTable.adminId` is left without a `.references()` call.

## Why
Drizzle resolves FK references at module evaluation time using forward-referenced lambdas. A circular pair causes one table to reference the other before it's fully initialized.

## How to apply
When adding new FK references, trace the reference graph first. If A → B and B → A, pick the "weaker" direction (usually the one least likely to cascade) to leave without a DB-level constraint.

## Indexes added alongside FKs
- budget_lines.budgetId
- invoice_items.invoiceId
- bon_items.bonId
- meeting_attendees.meetingId
- conversations.participant1Id, participant2Id
- support_tickets.submittedById, syndicateId, status
- salary_records.syndicateId
- caisse_entries.syndicateId
