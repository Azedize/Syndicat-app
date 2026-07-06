---
name: Stale lib/db dist masks schema errors
description: TypeScript can silently pass even when route code references Drizzle columns that no longer exist in the actual schema, because compiled .d.ts files in lib/db/dist are stale/out of sync with lib/db/src.
---

A route referenced `payslipsTable.employeeId`, but the real column in `lib/db/src/schema.ts` is `userId`. This should be a compile error, but it wasn't caught because `lib/db/dist` (pre-built declaration files) is stale and doesn't reflect the current source schema — some tooling resolves types against dist instead of src.

**Why:** This kind of mismatch only surfaces at runtime as a cryptic Postgres error like `syntax error at or near "="` (Drizzle emits an empty column name for a `undefined` field reference), not as a type error.

**How to apply:**
- When you see a Drizzle query fail with a blank/malformed column in the generated SQL (e.g. `where  = $1`), suspect a renamed/missing schema field — grep `lib/db/src/schema.ts` directly rather than trusting tsc to have caught it.
- Don't treat a clean `tsc --noEmit` as proof that all Drizzle table field references are valid while `lib/db/dist` is known to be stale in this project.
