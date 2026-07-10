# SYNDYCAT GLOBAL CPS — Permission Matrix

> Generated: Phase 1 — RBAC & Role Separation  
> Roles: **SA** = Super Admin · **SYA** = Syndic Admin · **MBR** = Member (Owner) · **TNT** = Tenant

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Allowed |
| ❌ | Blocked (403) |
| 🔭 | Super Admin only with `?supervision=true` flag |
| 👤 | Own records only |

---

## Platform Management (Super Admin only)

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Syndicates | Create | ✅ | ❌ | ❌ | ❌ |
| Syndicates | Read (all) | ✅ | 👤 | ❌ | ❌ |
| Syndicates | Update | ✅ | 👤 | ❌ | ❌ |
| Syndicates | Suspend/Activate | ✅ | ❌ | ❌ | ❌ |
| Subscriptions | Read (all) | ✅ | ❌ | ❌ | ❌ |
| Subscriptions | Read (own) | ❌ | ✅ | ❌ | ❌ |
| Subscriptions | Create/Update | ✅ | ✅ | ❌ | ❌ |
| Users | Read (all) | ✅ | 👤 | ❌ | ❌ |
| Users | Update status | ✅ | 👤 | ❌ | ❌ |
| Users | Change role | ✅ | ❌ | ❌ | ❌ |
| Users | Delete | ✅ | ❌ | ❌ | ❌ |
| Platform Statistics | Read | ✅ | ❌ | ❌ | ❌ |
| Audit Logs (all syndicates) | Read | ✅ | ❌ | ❌ | ❌ |
| Support Tickets (platform) | Read | ✅ | 👤 | ❌ | ❌ |

---

## Buildings & Lots

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Buildings | Create | 🔭 | ✅ | ❌ | ❌ |
| Buildings | Read (list) | ✅ | 👤 | 👤 | 👤 |
| Buildings | Read (detail) | ✅ | 👤 | 👤 | 👤 |
| Buildings | Update | 🔭 | ✅ | ❌ | ❌ |
| Buildings | Delete | 🔭 | ✅ | ❌ | ❌ |
| Lots | Create | 🔭 | ✅ | ❌ | ❌ |
| Lots | Read (list) | ✅ | 👤 | 👤 | ❌ |
| Lots | Read (my lot) | ❌ | ❌ | ✅ | ✅ |
| Lots | Update | 🔭 | ✅ | ❌ | ❌ |
| Lots | Delete | 🔭 | ✅ | ❌ | ❌ |
| Finance (building dashboard) | Read | ✅ | 👤 | ❌ | ❌ |

---

## Members & Tenants

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Members | Create | 🔭 | ✅ | ❌ | ❌ |
| Members | Read (list) | ✅ | 👤 | ❌ | ❌ |
| Members | Read (detail) | ✅ | 👤 | ❌ | ❌ |
| Members | Update | 🔭 | ✅ | ❌ | ❌ |
| Members | Delete | 🔭 | ✅ | ❌ | ❌ |
| Members | Export | ✅ | ✅ | ❌ | ❌ |
| Tenants | Create | 🔭 | ✅ | ❌ | ❌ |
| Tenants | Read (list) | ✅ | 👤 | ❌ | ❌ |
| Tenants | Read (detail) | ✅ | 👤 | ❌ | 👤 |
| Tenants | Update | 🔭 | ✅ | ❌ | ❌ |
| Tenants | Delete | 🔭 | ✅ | ❌ | ❌ |

---

## Finance

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Budget | Create | 🔭 | ✅ | ❌ | ❌ |
| Budget | Read | ✅ | 👤 | ❌ | ❌ |
| Budget | Update | 🔭 | ✅ | ❌ | ❌ |
| Budget | Approve | 🔭 | ✅ | ❌ | ❌ |
| Budget | Export | ✅ | ✅ | ❌ | ❌ |
| Appels de Fonds | Generate | 🔭 | ✅ | ❌ | ❌ |
| Appels de Fonds | Read (own) | ❌ | ❌ | ✅ | ❌ |
| Appels de Fonds | Submit payment | ❌ | ❌ | ✅ | ❌ |
| Appels de Fonds | Validate payment | 🔭 | ✅ | ❌ | ❌ |
| Transactions | Create | 🔭 | ✅ | ❌ | ❌ |
| Transactions | Read | ✅ | 👤 | ❌ | ❌ |
| Invoices | Create | 🔭 | ✅ | ❌ | ❌ |
| Invoices | Read | ✅ | 👤 | ❌ | ❌ |
| Invoices | Update status | 🔭 | ✅ | ❌ | ❌ |
| Bons de livraison | Create | 🔭 | ✅ | ❌ | ❌ |
| Bons de livraison | Read | ✅ | 👤 | ❌ | ❌ |
| Caisse | Create entry | 🔭 | ✅ | ❌ | ❌ |
| Caisse | Read | ✅ | 👤 | ❌ | ❌ |
| Salary Records | Create | 🔭 | ✅ | ❌ | ❌ |
| Salary Records | Read | ✅ | 👤 | ❌ | ❌ |
| Debt Escalations | Trigger scan | 🔭 | ✅ | ❌ | ❌ |
| Debt Escalations | Read | ✅ | 👤 | ❌ | ❌ |

---

## Governance

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Meetings (AG) | Create | 🔭 | ✅ | ❌ | ❌ |
| Meetings (AG) | Read | ✅ | 👤 | ✅ | ❌ |
| Meetings (AG) | Attend | 🔭 | ✅ | ✅ | ❌ |
| Meetings (AG) | Update status | 🔭 | ✅ | ❌ | ❌ |
| Meetings (AG) | Export PV | ✅ | 👤 | ❌ | ❌ |
| Elections | Create | 🔭 | ✅ | ❌ | ❌ |
| Elections | Read | ✅ | 👤 | ✅ | ❌ |
| Elections | Vote | ❌ | ❌ | ✅ | ❌ |
| Elections | Update | 🔭 | ✅ | ❌ | ❌ |

---

## Operations

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Travaux | Create | 🔭 | ✅ | ❌ | ❌ |
| Travaux | Read | ✅ | 👤 | ✅ | ✅ |
| Travaux | Update | 🔭 | ✅ | ❌ | ❌ |
| Travaux | Assign | 🔭 | ✅ | ❌ | ❌ |
| Sinistres | Create (report) | ❌ | ❌ | ✅ | ✅ |
| Sinistres | Create (admin) | 🔭 | ✅ | ❌ | ❌ |
| Sinistres | Read | ✅ | 👤 | 👤 | ❌ |
| Sinistres | Update | 🔭 | ✅ | ❌ | ❌ |
| Prestataires | Create | 🔭 | ✅ | ❌ | ❌ |
| Prestataires | Read | ✅ | 👤 | ❌ | ❌ |
| Prestataires | Update | 🔭 | ✅ | ❌ | ❌ |
| Contracts | Create | 🔭 | ✅ | ❌ | ❌ |
| Contracts | Read | ✅ | 👤 | ❌ | ❌ |
| Parking | Read | ✅ | 👤 | 👤 | ❌ |
| Parking | Manage | 🔭 | ✅ | ❌ | ❌ |

---

## Documents & Communication

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Documents | Upload | 🔭 | ✅ | ❌ | ❌ |
| Documents | Read (published) | ✅ | 👤 | ✅ | ✅ |
| Documents | Update | 🔭 | ✅ | ❌ | ❌ |
| Documents | Delete | ✅ | 👤 | ❌ | ❌ |
| Documents | Export | ✅ | ✅ | ❌ | ❌ |
| Chat | Read/Send | ✅ | ✅ | ✅ | ✅ |
| Publications | Read | ✅ | ✅ | ✅ | ✅ |
| Publications | Create | 🔭 | ✅ | ❌ | ❌ |
| Announcements | Read | ✅ | ✅ | ✅ | ✅ |
| Announcements | Create | 🔭 | ✅ | ❌ | ❌ |
| Support Tickets | Create | ✅ | ✅ | ✅ | ✅ |
| Support Tickets | Read (own) | ✅ | ✅ | ✅ | ✅ |
| Support Tickets | Manage | ✅ | 👤 | ❌ | ❌ |

---

## Marketplace

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Products | Read (approved) | ✅ | ✅ | ✅ | ❌ |
| Products | Create | 🔭 | ✅ | ✅ | ❌ |
| Products | Update (own) | 🔭 | ✅ | ✅ | ❌ |
| Products | Moderate | ✅ | ✅ | ❌ | ❌ |
| Orders | Create | ❌ | ❌ | ✅ | ❌ |
| Orders | Read (own) | ❌ | ❌ | ✅ | ❌ |

---

## Audit & Security

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Audit Logs | Read (platform) | ✅ | ❌ | ❌ | ❌ |
| Audit Logs | Read (own syndicate) | ❌ | ✅ | ❌ | ❌ |
| Storage | Upload | ✅ | ✅ | ❌ | ❌ |
| Storage | Read (own syndicate) | ✅ | 👤 | ❌ | ❌ |
| Storage | Delete | ✅ | 👤 | ❌ | ❌ |
| Statistics (HR/Finance) | Read | ✅ | 👤 | ❌ | ❌ |
| Statistics (platform) | Read | ✅ | ❌ | ❌ | ❌ |
| Statistics (buildings) | Read | ✅ | ❌ | ❌ | ❌ |

---

## Notes

- **👤 (own records)**: Syndic Admin is scoped to their JWT `syndicateId`. Member/Tenant are scoped to their own records only.
- **🔭 (supervision)**: Super Admin must pass `?supervision=true` on operational write routes. Every such access is logged to the audit log.
- All checks are enforced at **three layers**: middleware (role), handler (syndicate isolation), and query (Drizzle WHERE clause).
- Frontend role checks mirror this matrix via the `usePermission()` hook but are never the sole enforcement layer.
