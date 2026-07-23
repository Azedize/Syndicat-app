/**
 * Twilio Verify — SMS OTP service
 *
 * Uses Twilio Verify API (not SMS directly) so rate-limiting,
 * fraud protection, and code expiry are all managed by Twilio.
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_VERIFY_SERVICE_SID
 */
import { logger } from "./logger.js";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN non configurés");
  }
  // Dynamic import avoids bundling issues with Twilio's large dep tree
  const twilio = require("twilio");
  return twilio(accountSid, authToken);
}

function getServiceSid(): string {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid) throw new Error("TWILIO_VERIFY_SERVICE_SID non configuré");
  return sid;
}

export function twilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN  &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

/**
 * Normalise a phone number to E.164 format.
 * Accepts: +212XXXXXXXXX, 0XXXXXXXXX (Morocco), or raw digits.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "");
  // Already E.164
  if (/^\+\d{7,15}$/.test(digits)) return digits;
  // Moroccan local (0X…) → +212X…
  if (/^0[5-7]\d{8}$/.test(digits)) return "+212" + digits.slice(1);
  // Bare digits without leading +
  if (/^\d{7,15}$/.test(digits)) return "+" + digits;
  throw new Error(`Numéro de téléphone invalide : ${raw}`);
}

export interface SmsOtpSendResult {
  ok: boolean;
  status?: string;
  error?: string;
}

/**
 * Send an SMS OTP via Twilio Verify.
 * Returns { ok: true, status } on success, { ok: false, error } on failure.
 */
export async function sendSmsOtp(phone: string): Promise<SmsOtpSendResult> {
  if (!twilioConfigured()) {
    return { ok: false, error: "Twilio non configuré (variables d'env manquantes)" };
  }
  try {
    const normalized = normalizePhone(phone);
    const client = getTwilioClient();
    const verification = await client.verify.v2
      .services(getServiceSid())
      .verifications.create({ to: normalized, channel: "sms" });

    logger.info({ phone: normalized, status: verification.status }, "Twilio Verify SMS envoyé");
    return { ok: true, status: verification.status };
  } catch (err: any) {
    const msg = err?.message ?? "Erreur Twilio inconnue";
    logger.error({ err: msg }, "Twilio Verify sendSmsOtp error");
    return { ok: false, error: msg };
  }
}

export interface SmsOtpCheckResult {
  ok: boolean;
  valid?: boolean;
  status?: string;
  error?: string;
}

/**
 * Verify an SMS OTP code via Twilio Verify.
 * Returns { ok: true, valid: true } when the code is correct.
 */
export async function checkSmsOtp(phone: string, code: string): Promise<SmsOtpCheckResult> {
  if (!twilioConfigured()) {
    return { ok: false, error: "Twilio non configuré" };
  }
  try {
    const normalized = normalizePhone(phone);
    const client = getTwilioClient();
    const check = await client.verify.v2
      .services(getServiceSid())
      .verificationChecks.create({ to: normalized, code: code.trim() });

    const valid = check.status === "approved";
    logger.info({ phone: normalized, status: check.status }, "Twilio Verify check");
    return { ok: true, valid, status: check.status };
  } catch (err: any) {
    const msg = err?.message ?? "Erreur Twilio inconnue";
    logger.error({ err: msg }, "Twilio Verify checkSmsOtp error");
    return { ok: false, error: msg };
  }
}
