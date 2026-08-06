# Security Log

## 2026-08-06

- List-loading error surfaces on workflows and works no longer expose raw API error details to end users; recovery uses localized guidance and an explicit retry action.
- Ideas list and action failures no longer surface raw API messages; users receive localized recovery guidance while authorization and API persistence remain unchanged.
- National dashboard data failures now fail visibly and safely without fabricating zero-valued platform KPIs or exposing raw API details; Super Admin authorization remains enforced by the existing role guard.
- Platform Support now distinguishes unavailable ticket data from a genuine empty queue and does not expose raw API errors; the existing `super_admin`/`syndicate_admin` RoleGuard and scoped support API remain unchanged.
- Marketplace Moderation now distinguishes unavailable moderation data from genuine empty queues and does not expose raw API errors; the existing Super Admin-only RoleGuard remains enforced.
- Document Recycle Bin now distinguishes unavailable deleted-document data from a genuine empty archive and does not expose raw API errors; existing restore and Super Admin-only purge controls remain unchanged.