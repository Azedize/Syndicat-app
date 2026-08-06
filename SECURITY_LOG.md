- Ma Boutique changes preserve the existing authenticated marketplace API, seller CRUD permissions, upload authorization, destructive confirmations, and promotion proof-of-payment flow; raw API errors are not exposed.
# Security Log

## 2026-08-06

- List-loading error surfaces on workflows and works no longer expose raw API error details to end users; recovery uses localized guidance and an explicit retry action.
- Ideas list and action failures no longer surface raw API messages; users receive localized recovery guidance while authorization and API persistence remain unchanged.
- National dashboard data failures now fail visibly and safely without fabricating zero-valued platform KPIs or exposing raw API details; Super Admin authorization remains enforced by the existing role guard.
- Platform Support now distinguishes unavailable ticket data from a genuine empty queue and does not expose raw API errors; the existing `super_admin`/`syndicate_admin` RoleGuard and scoped support API remain unchanged.
- Marketplace Moderation now distinguishes unavailable moderation data from genuine empty queues and does not expose raw API errors; the existing Super Admin-only RoleGuard remains enforced.
- Document Recycle Bin now distinguishes unavailable deleted-document data from a genuine empty archive and does not expose raw API errors; existing restore and Super Admin-only purge controls remain unchanged.
- Governance localization preserved the existing management-role guard and destructive-action confirmations; member removal and delegation revocation remain explicit user-confirmed actions.
- Internal Messaging now distinguishes an unavailable announcement response from a genuine empty inbox/sent folder and does not expose raw API errors; existing protected access and announcement API authorization remain unchanged.
- Documents Dashboard localization preserved the existing role-scoped administrator quick actions and database/API-derived document counts; no client-side fallback statistics were introduced.
- Administrative Acts retains the existing `RoleGuard` and admin-only mutation controls; its new retry state does not expose raw API errors or alter the `/actes` authorization contract.
- Sinistres & Incidents retains its existing management-role guard and authenticated API scoping; claim load and create failures now use safe localized messages without exposing raw server details.
- Mon Lot retains its existing owner/governance RoleGuard and `/lots/my-lot` personal endpoint; dependency failures use safe localized recovery without exposing raw API details or inventing financial values.
- Mon Bail & Loyer retains its tenant-only RoleGuard and `/locataires/my-lease` personal endpoint; lease failures use safe localized recovery without exposing raw server details.
- Travaux workflow failures now use fixed localized messages rather than returning raw server error text to the mobile UI.
- Notification preference updates remain user-scoped by the existing API contract; the UX pass changes presentation only and does not broaden alert visibility or mutation permissions.
- Chat localization preserves existing conversation access, message mutation permissions, report actions, attachment authorization, and protected-route behavior; no API scope was changed.
- Level-1 Support localization preserves the existing member/tenant/syndicate-admin access boundary, syndicate-scoped ticket APIs, reply permissions, and admin-only resolve/escalate controls.