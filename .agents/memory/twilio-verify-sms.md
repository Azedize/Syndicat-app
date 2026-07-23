---
name: Twilio Verify SMS OTP
description: SMS OTP integration via Twilio Verify — endpoints, service SID creation, and mobile screen.
---

## Twilio Verify SMS Integration

**Why:** Needed production-grade SMS OTP (rate-limited, fraud-protected) like big apps (WhatsApp/Uber pattern).

**How to apply:** Use `POST /api/auth/sms/send` + `POST /api/auth/sms/verify` for any phone verification flow.

### Key facts
- Twilio Verify Service was created programmatically (original SID VVAfb8985d... was invalid — VV prefix is wrong, must be VA).
- Real service SID stored in TWILIO_VERIFY_SERVICE_SID secret (VAf9866c30132879c4908d7d77f2b1a0ab).
- `artifacts/api-server/src/lib/twilioVerify.ts` — wrapper: sendSmsOtp, checkSmsOtp, normalizePhone, twilioConfigured.
- `normalizePhone()` handles Moroccan local (0XXXXXXXXX → +212XXXXXXXXX) and E.164 passthrough.
- `artifacts/mobile/app/sms-verify.tsx` — OTP screen: 6-digit boxes, 10-min timer, 60s resend cooldown, send status banners.
- Twilio uses dynamic require() (not ESM import) to avoid bundler issues.

### Navigation pattern
```typescript
router.push({ pathname: "/sms-verify", params: { phone: encodeURIComponent(phone), redirect: "/profile" } });
```

### Verified working
- `GET /api/auth/twilio/status` → `{ configured: true }`
- `POST /api/auth/sms/send` → `{ message: "Code SMS envoyé", status: "pending" }`
