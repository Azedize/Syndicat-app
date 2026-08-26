---
name: pnpm workspace package install
description: Workspace package dependency updates need package-local targeting rather than root-level installer calls.
---

When updating a dependency in a pnpm workspace, the package-management helper may target the workspace root and reject the install. Apply the version to the owning package manifest, then run the workspace install to synchronize the lockfile.

**Why:** A root-level dependency change can pollute the workspace manifest or fail before touching the intended artifact.

**How to apply:** Confirm the owning package first, edit only its package.json, run pnpm install, and verify with a package-scoped dependency listing.