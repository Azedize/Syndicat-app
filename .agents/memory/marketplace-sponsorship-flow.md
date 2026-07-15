---
name: Marketplace sponsorship payment flow
description: Seller-initiated paid promotion flow for marketplace listings — proof-of-payment convention, schema changes, route registration order pitfall.
---

## Rule
Sponsored listings use the same "submit proof, admin validates" convention as appels-de-fonds. Never auto-activate a paid promotion without admin verification of proof.

**Why:** No real payment gateway is integrated; trust is enforced by requiring a `proofUrl` (uploaded to GCS via `/storage/uploads`) before admin can approve. This is a deliberate platform design choice, consistent with the budget module.

## Schema additions to `marketplacePromotionsTable`
- `status` default changed to `"pending_payment"` (was `"active"`)
- Added: `paymentMethod text`, `proofUrl text`, `rejectionReason text`, `approvedBy text`, `validatedAt timestamp`
- Run `pnpm --filter @workspace/db run db:push` after schema edits.

## Endpoints
- `POST /products/:id/promotions/request` — seller submits type/duration/paymentMethod/proofUrl; amount is server-computed via `PROMO_RATE_PER_DAY` (top_search: 15, featured: 25, homepage: 40 MAD/day).
- `GET /products/my-promotions` — seller's own promo history.
- `GET /products/promotions/pending` — admin queue (status=pending_payment).
- `PUT /products/promotions/:id/validate` — admin approve (requires proofUrl present) or reject (requires rejectionReason). On approve: shifts startDate=now, endDate=now+originalDuration; sets boosted/featured/boostExpiresAt on product.

## Route order — critical
`GET /products/my-promotions` (2-segment) MUST be registered **before** `GET /products/:id` (2-segment wildcard) or it is silently shadowed. Confirmed placed before `/products/:id` in marketplace.ts.

`GET /products/promotions/pending` (3-segment) is safe from 2-segment `:id` shadowing.

## Mobile
- `services/api.ts`: `requestPromotion`, `myPromotions`, `pendingPromotions`, `validatePromotion` client methods.
- `my-shop.tsx`: "Sponsoriser" button on approved listings (hidden when pending/active); sponsor modal with type/duration/payment method/proof upload; promo status badge on listings.
- `product-detail.tsx`: admin panel shows pending promo for the product (fetched from pendingPromotions filtered by productId) with approve/reject buttons; reject uses in-screen TextInput modal (not Alert.prompt — cross-platform incompatible).

## How to apply
Any future payment-verified feature (e.g. paid job listings, event promotions) should reuse this pattern: pending_payment → proofUrl submitted → admin validates → service activated.
