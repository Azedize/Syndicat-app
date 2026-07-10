---
name: Database seed script
description: How to run the seed script and a data bug it had in the transactions table.
---

Run with `pnpm --filter @workspace/scripts run seed`. Seeds all roles/tables; not idempotent (uses `.onConflictDoNothing()` in most places but will still throw on FK violations if IDs are wrong). Demo credentials are printed in the seed script's own console output — do not duplicate them here.

**Lesson:** this schema has inconsistent FK targets — some `memberId`/`ownerId` columns reference the `members` table, others reference `users`, and the two tables' ID sequences are numbered independently (not 1:1 by suffix).

**Why:** easy to seed a value that satisfies the wrong table's ID convention, either causing an FK violation or (worse) inserting a row that silently points at the wrong person.

**How to apply:** before seeding or fixing an FK violation on such a column, check which table `.references()` actually targets in the schema, then match rows by name/email — never assume matching numeric suffixes refer to the same entity.
