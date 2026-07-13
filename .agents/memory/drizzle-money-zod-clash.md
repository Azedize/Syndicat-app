---
name: Drizzle money() vs Zod number type clash
description: money() columns expect string types from Drizzle; Zod validates amounts as number — causes TS2769 on .values() inserts and TS2365 on arithmetic with fetched values.
---

## Rule
When inserting a row that includes a Drizzle `money()` column (defined as `numeric(12,2)`), the column type expects `string | SQL<unknown> | Placeholder`. Zod typically validates numeric fields as `number`. This causes `TS2769 No overload matches` on `.values({...})` calls.

For fetched `money()` values used in arithmetic, the JS runtime returns a `string` (Postgres numeric → JS string), causing `TS2365 Operator '+' cannot be applied`.

**Why:** Drizzle maps `numeric()` columns to TypeScript `string` to preserve decimal precision, not `number`.

**How to apply:**
- Insert with spread: `.values({ ...zodData, syndicateId } as any)` — safe when Zod already validated the input.
- Insert with named fields: `.values({ amount: String(amount), ... })` — more precise.
- Arithmetic on fetched values: `const lastBalance = Number(row.balance ?? 0)` before `lastBalance + amount`.
- For nullable money columns in `.includes()` or string operations: `row.amount ?? "0"` or `row.status ?? ""`.
