/**
 * ZimSend SMS Service — replaces Twilio Verify
 *
 * Required env vars:
 *   ZIMSEND_API_KEY
 *   ZIMSEND_CLIENT_ID
 *   ZIMSEND_DEVICE_ID
 *   ZIMSEND_BASE_URL   (e.g. https://app.zimsend.com)
 *
 * OTP policy:
 *   - 6-digit random code
 *   - Expires in 5 minutes
 *   - Max 5 verification attempts per code
 *   - Resend blocked for 60 seconds after last send
 */

import axios, { AxiosError } from "axios";
import { createHash, randomInt } from "node:crypto";
import { logger } from "./logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  const apiKey    = process.env.ZIMSEND_API_KEY;
  const clientId  = process.env.ZIMSEND_CLIENT_ID;
  const deviceId  = process.env.ZIMSEND_DEVICE_ID;
  const baseUrl   = process.env.ZIMSEND_BASE_URL;

  if (!apiKey || !clientId || !deviceId || !baseUrl) {
    throw new ZimSendConfigError(
      "ZimSend non configuré — variables manquantes: ZIMSEND_API_KEY, ZIMSEND_CLIENT_ID, ZIMSEND_DEVICE_ID, ZIMSEND_BASE_URL"
    );
  }

  return { apiKey, clientId, deviceId, baseUrl: baseUrl.replace(/\/$/, "") };
}

export function zimSendConfigured(): boolean {
  return !!(
    process.env.ZIMSEND_API_KEY &&
    process.env.ZIMSEND_CLIENT_ID &&
    process.env.ZIMSEND_DEVICE_ID &&
    process.env.ZIMSEND_BASE_URL
  );
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a phone number to E.164.
 * Accepts +212XXXXXXXXX, 0XXXXXXXXX (Morocco), or raw digits.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (/^\+\d{7,15}$/.test(digits)) return digits;
  if (/^0[5-7]\d{8}$/.test(digits)) return "+212" + digits.slice(1);
  if (/^\d{7,15}$/.test(digits)) return "+" + digits;
  throw new InvalidPhoneError(`Numéro de téléphone invalide : ${raw}`);
}

// ─── OTP store (in-memory) ────────────────────────────────────────────────────

const OTP_TTL_MS      = 5 * 60 * 1_000;  // 5 minutes
const OTP_MAX_TRIES   = 5;
const OTP_RESEND_COOL = 60 * 1_000;       // 60 seconds

interface OtpEntry {
  codeHash: string;   // SHA-256(code) — fast secure comparison
  expiresAt: number;  // unix ms
  sentAt: number;     // unix ms — for resend cooldown
  attempts: number;
}

// Keyed by normalised E.164 phone number
const _store = new Map<string, OtpEntry>();

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  // Cryptographically secure random 6-digit code
  return String(randomInt(100_000, 1_000_000));
}

// ─── ZimSend HTTP client ──────────────────────────────────────────────────────

export interface SendSmsResult {
  success: boolean;
  provider: "ZimSend";
  error?: string;
}

/**
 * Send a raw SMS message via ZimSend.
 * Never logs the API key or message body.
 */
export async function sendSMS(phone: string, message: string): Promise<SendSmsResult> {
  const config = getConfig();

  logger.info({ phone }, "ZimSend: sending SMS");

  try {
    await axios.post(
      `${config.baseUrl}/v1/sms/send`,
      { to: phone, message },
      {
        headers: {
          "X-API-Key":    config.apiKey,
          "X-Client-ID":  config.clientId,
          "X-Device-ID":  config.deviceId,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      }
    );

    logger.info({ phone }, "ZimSend: SMS delivered");
    return { success: true, provider: "ZimSend" };
  } catch (err) {
    const mapped = ZimSendErrorMapper.map(err);
    logger.error({ phone, code: mapped.code }, `ZimSend: SMS failed — ${mapped.message}`);
    return { success: false, provider: "ZimSend", error: mapped.message };
  }
}

// ─── OTP high-level helpers ───────────────────────────────────────────────────

export interface SendOtpResult {
  ok: boolean;
  phone?: string;
  expiresIn?: number;   // seconds
  error?: string;
  errorCode?: string;
}

/**
 * Generate a 6-digit OTP, store it, and send via ZimSend SMS.
 */
export async function sendOtp(rawPhone: string): Promise<SendOtpResult> {
  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch {
    return { ok: false, error: `Numéro de téléphone invalide : ${rawPhone}`, errorCode: "INVALID_PHONE" };
  }

  // Resend cooldown
  const existing = _store.get(phone);
  if (existing && Date.now() < existing.sentAt + OTP_RESEND_COOL) {
    const wait = Math.ceil((existing.sentAt + OTP_RESEND_COOL - Date.now()) / 1_000);
    return { ok: false, error: `Attendez ${wait} secondes avant de renvoyer un code.`, errorCode: "RESEND_TOO_SOON" };
  }

  if (!zimSendConfigured()) {
    return { ok: false, error: "ZimSend non configuré (variables d'env manquantes)", errorCode: "NOT_CONFIGURED" };
  }

  const code = generateOtp();
  const now  = Date.now();

  _store.set(phone, {
    codeHash:  hashCode(code),
    expiresAt: now + OTP_TTL_MS,
    sentAt:    now,
    attempts:  0,
  });

  const message = `Votre code de vérification MIZAN est : ${code}. Valable 5 minutes.`;
  const result  = await sendSMS(phone, message);

  if (!result.success) {
    _store.delete(phone);
    return { ok: false, error: result.error ?? "Échec de l'envoi du SMS", errorCode: "SEND_FAILED" };
  }

  return { ok: true, phone, expiresIn: OTP_TTL_MS / 1_000 };
}

export interface VerifyOtpResult {
  ok: boolean;
  verified?: boolean;
  phone?: string;
  attemptsLeft?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Verify a 6-digit OTP code for the given phone number.
 * Returns { ok: true, verified: true } on success.
 */
export async function verifyOtp(rawPhone: string, code: string): Promise<VerifyOtpResult> {
  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch {
    return { ok: false, error: `Numéro de téléphone invalide : ${rawPhone}`, errorCode: "INVALID_PHONE" };
  }

  const entry = _store.get(phone);
  if (!entry) {
    return { ok: false, error: "Aucun code en attente pour ce numéro. Demandez un nouveau code.", errorCode: "NOT_FOUND" };
  }

  if (Date.now() > entry.expiresAt) {
    _store.delete(phone);
    return { ok: false, error: "Code expiré. Demandez un nouveau code.", errorCode: "EXPIRED" };
  }

  if (entry.attempts >= OTP_MAX_TRIES) {
    _store.delete(phone);
    return { ok: false, error: "Trop de tentatives incorrectes. Demandez un nouveau code.", errorCode: "MAX_ATTEMPTS" };
  }

  entry.attempts += 1;
  const attemptsLeft = OTP_MAX_TRIES - entry.attempts;

  const valid = hashCode(code.trim()) === entry.codeHash;
  if (!valid) {
    return {
      ok: false,
      error: attemptsLeft > 0
        ? `Code incorrect. ${attemptsLeft} tentative(s) restante(s).`
        : "Code incorrect. Plus de tentatives disponibles. Demandez un nouveau code.",
      errorCode: "WRONG_CODE",
      attemptsLeft,
    };
  }

  // Valid — consume the entry
  _store.delete(phone);
  logger.info({ phone }, "ZimSend OTP: verified successfully");
  return { ok: true, verified: true, phone };
}

// ─── Error mapper ─────────────────────────────────────────────────────────────

interface MappedError {
  code: string;
  message: string;
  httpStatus: number;
}

export class ZimSendErrorMapper {
  static map(err: unknown): MappedError {
    if (err instanceof InvalidPhoneError) {
      return { code: "INVALID_PHONE", message: err.message, httpStatus: 400 };
    }
    if (err instanceof ZimSendConfigError) {
      return { code: "NOT_CONFIGURED", message: err.message, httpStatus: 500 };
    }

    if (axios.isAxiosError(err)) {
      const axErr = err as AxiosError<{ message?: string; error?: string }>;

      if (!axErr.response) {
        // Network timeout or DNS failure
        return { code: "NETWORK_ERROR", message: "Délai d'attente dépassé ou erreur réseau ZimSend.", httpStatus: 503 };
      }

      const status  = axErr.response.status;
      const body    = axErr.response.data;
      const detail  = body?.message ?? body?.error ?? axErr.message;

      switch (status) {
        case 401: return { code: "UNAUTHORIZED",  message: `Clé API ZimSend invalide. ${detail}`,          httpStatus: 401 };
        case 403: return { code: "FORBIDDEN",     message: `Accès ZimSend refusé. ${detail}`,               httpStatus: 403 };
        case 404: return { code: "NOT_FOUND",     message: `Endpoint ZimSend introuvable. ${detail}`,       httpStatus: 404 };
        case 429: return { code: "RATE_LIMITED",  message: "Limite de débit ZimSend atteinte. Réessayez plus tard.", httpStatus: 429 };
        default:  return { code: "PROVIDER_ERROR",message: `Erreur ZimSend (${status}): ${detail}`,        httpStatus: 502 };
      }
    }

    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return { code: "UNKNOWN", message: msg, httpStatus: 500 };
  }
}

// ─── Custom errors ────────────────────────────────────────────────────────────

export class ZimSendConfigError extends Error {
  constructor(message: string) { super(message); this.name = "ZimSendConfigError"; }
}

export class InvalidPhoneError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidPhoneError"; }
}
