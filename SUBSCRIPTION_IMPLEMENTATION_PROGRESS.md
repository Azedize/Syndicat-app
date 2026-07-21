# SYNDYCAT — Subscription System Implementation Progress

Last updated: 2026-07-21

---

## ✅ Phase 1 — Database Schema

| Task | Status |
|---|---|
| Add feature-limit columns to `subscriptionPlansTable` | ✅ Done |
| Add trial/billing period columns to `syndicateSubscriptionsTable` | ✅ Done |
| Create `billingInvoicesTable` | ✅ Done |
| Push schema to DB (`db:push`) | ✅ Done |

**New columns — `subscription_plans`:**
- `description`, `color`, `sort_order`, `is_active`, `is_trial`
- `yearly_price`, `max_buildings`, `max_lots`, `max_members`
- `max_storage_gb`, `max_documents`, `max_signatures`

**New columns — `syndicate_subscriptions`:**
- `trial_start_date`, `trial_end_date`
- `current_period_start`, `current_period_end`
- `canceled_at`, `grace_period_end`, `notes`

**New table — `billing_invoices`:**
- `id`, `syndicate_id`, `subscription_id`, `amount`, `status`
- `due_date`, `paid_at`, `description`, `period_start`, `period_end`

---

## ✅ Phase 2 — Seed Subscription Plans

| Plan | Price (MAD/mois) | Status |
|---|---|---|
| Essai Gratuit (trial) | 0 | ✅ Seeded |
| Starter | 299 | ✅ Seeded |
| Professional | 699 | ✅ Seeded |
| Business | 1 299 | ✅ Seeded |
| Enterprise | 2 499 | ✅ Seeded |

All existing syndicates without a subscription have been auto-assigned a 30-day free trial.

---

## ✅ Phase 3 — API Routes (`/api/subscriptions/...`)

| Endpoint | Method | Access | Status |
|---|---|---|---|
| `/subscriptions/plans` | GET | All authenticated | ✅ |
| `/subscriptions/plans/all` | GET | super_admin | ✅ |
| `/subscriptions/plans` | POST | super_admin | ✅ |
| `/subscriptions/plans/:id` | PUT | super_admin | ✅ |
| `/subscriptions/my` | GET | syndicate_admin/member | ✅ |
| `/subscriptions/status` | GET | All (lightweight banner check) | ✅ |
| `/subscriptions` | GET | super_admin | ✅ |
| `/subscriptions` | POST | Admin (subscribe to plan) | ✅ |
| `/subscriptions/:id` | PUT | Admin (status/autoRenew update) | ✅ |
| `/subscriptions/trial` | POST | super_admin | ✅ |
| `/subscriptions/invoices` | GET | Scoped by role | ✅ |
| `/subscriptions/invoices/:id/pay` | PUT | super_admin | ✅ |

**Key logic:**
- `computeSubscriptionStatus()` — derives effective status from DB values and current time
- `getDaysRemaining()` — returns days until expiry or null
- `enrichSubscription()` — adds `effectiveStatus`, `isExpired`, `isReadOnly`, `isTrial`, `isGrace`, `daysRemaining`, `expiryDate` to every response

---

## ✅ Phase 4 — Trial Auto-Assignment

- `assignTrial()` exported from `subscriptions.ts`
- `POST /syndicates` (create syndicate) auto-calls `assignTrial()` after creation
- Existing syndicates retroactively assigned trials via SQL migration

---

## ✅ Phase 5 — Subscription Enforcement Middleware

File: `artifacts/api-server/src/middleware/subscription.ts`

- `requireActiveSubscription` middleware
- Returns HTTP 402 with `code: "SUBSCRIPTION_REQUIRED"` and `upgradeUrl: "/abonnements"` when expired/suspended
- super_admin is always exempt
- Fail-open on DB error (billing glitch never breaks core operations)

---

## ✅ Phase 6 — Mobile: `abonnements.tsx` Full Rewrite

**Features:**
- 3-tab layout (super_admin: Syndicats / Plans / Facturation; syndicate_admin: Plans / Factures)
- **Syndicats tab**: KPI strip (Total / Actifs / Essais / Expirés / MRR), subscription cards with days remaining countdown, manage modal
- **Plans tab**: Billing interval toggle (monthly/yearly −15%), plan cards with limits chips, feature list, upgrade button
- **Facturation tab**: Invoice list with pay action (super_admin)
- Current plan card with expiry countdown and read-only warning banner
- Manage modal (super_admin): plan selector, status actions (suspend/reactivate/cancel)

---

## ✅ Phase 7 — Mobile: SubscriptionBanner Component

File: `artifacts/mobile/components/SubscriptionBanner.tsx`

- Polls `/subscriptions/status` every 5 minutes
- Visible when: expired, grace period, OR ≤7 days remaining
- 3 states: expired (red), grace (orange), warning (blue)
- Upgrade button → `/abonnements`
- Dismissible (except when expired/read-only)
- Integrated into `_layout.tsx` (shown on all authenticated screens)

---

## 🔲 Phase 8 — Subscription Enforcement on Write Routes (TODO)

Apply `requireActiveSubscription` middleware to key write routes:
- `POST /meetings` (create meeting)
- `POST /documents` (generate document)
- `POST /documents/:id/sign` (sign document)
- `POST /appels-de-fonds` (create payment demand)
- `POST /transactions` (record payment)
- `POST /elections` (create election)

---

## 🔲 Phase 9 — Expiry Notification Cron (TODO)

Daily scheduled job to send push notifications:
- 7 days before trial expiry
- 3 days before expiry
- 1 day before expiry
- Day of expiry
- Day after expiry (read-only warning)

---

## 🔲 Phase 10 — Old Plans Cleanup (TODO)

Remove legacy plans: "Basique", "Pro", "Premium" (pre-migration plans without limits).
SQL: `DELETE FROM subscription_plans WHERE name IN ('Basique', 'Pro', 'Premium');`

---

## Architecture Decisions

### Subscription Status State Machine

```
trial → expired (when trialEndDate < now)
trial → active (when admin subscribes to paid plan)
active → grace (when currentPeriodEnd < now AND gracePeriodEnd > now)
active/grace → expired (when gracePeriodEnd < now)
active → suspended (manual action by super_admin)
suspended → active (manual reactivation by super_admin)
any → cancelled (explicit cancellation)
```

### Read-only Mode
When `isReadOnly = true` (status: expired or suspended):
- Write API routes return HTTP 402 with `code: "SUBSCRIPTION_REQUIRED"`
- Mobile banner shown persistently (non-dismissible)
- No data is deleted — all data preserved

### Billing Interval
- Monthly: price column (MAD/mois)
- Yearly: yearlyPrice column ≈ 10× monthly (−15% discount)
- Invoice generated automatically on subscription activation
