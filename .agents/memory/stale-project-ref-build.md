---
name: Stale db/lib project-reference builds
description: Why editing lib/db/src/schema.ts doesn't show up in downstream typecheck until dist is rebuilt.
---

`lib/db/package.json` exports map points `"./schema"` at `./src/schema.ts` (source, not dist), but `lib/db/tsconfig.json` has `composite: true` with `outDir: ./dist`, and consumer packages (e.g. `api-server`) reference it via TS project references. TypeScript project references resolve through the built `.d.ts` output, not the exports map, so after editing `schema.ts` you get errors like "Output file .../dist/schema.d.ts has not been built from source file" or downstream types silently reverting to old column shapes.

**Why:** composite project references are declaration-file based; the exports map is only relevant for the JS runtime resolution, not for tsc's cross-project type checking.

**How to apply:** after any schema/lib source edit, run `npx tsc -b lib/db lib/api-zod` (or the relevant lib package) to rebuild `dist/*.d.ts` before typechecking consumers. Deleting `tsconfig.tsbuildinfo` alone is not sufficient — the dist `.d.ts` files must actually be regenerated.
