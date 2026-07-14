/**
 * Centralized EmailService — the only place in the codebase that talks to SMTP.
 *
 * Credentials are read exclusively from environment variables (never hardcoded):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, USE_TLS (+ optional SMTP_SECURE, SMTP_FROM)
 *
 * Every send is logged to `email_logs` (recipient/subject/template/status/error/sentAt),
 * retried with backoff on transient failure, and recorded to the audit log.
 */
import { db } from "@workspace/db";
import { emailLogsTable, auditLogsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { logger } from "../logger.js";
import { wrapEmail } from "./templates.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [500, 1500]; // delay before attempt 2 and attempt 3

function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporterPromise: Promise<import("nodemailer").Transporter> | null = null;

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const nodemailer = await import("nodemailer");
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        // secure=true only for implicit-TLS ports (465). Gmail on 587 uses STARTTLS,
        // which is controlled by requireTLS, not `secure`.
        secure: process.env.SMTP_SECURE === "true",
        requireTLS: process.env.USE_TLS !== "false",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    })();
  }
  return transporterPromise;
}

/**
 * Verifies the SMTP connection/credentials. Called once at server boot so a
 * misconfigured mailbox is surfaced in the logs immediately rather than on the
 * first user-facing email attempt. Never throws — a down mail server must not
 * prevent the API from starting.
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!smtpConfigured()) {
    logger.warn("SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — emails will be logged only, not delivered.");
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    logger.info({ host: process.env.SMTP_HOST, port: process.env.SMTP_PORT }, "SMTP connection verified");
    return { ok: true };
  } catch (err: any) {
    logger.error({ err: err?.message }, "SMTP connection verification failed");
    return { ok: false, error: err?.message ?? "Unknown SMTP error" };
  }
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Template key for logging/filtering, e.g. "welcome", "password_reset". */
  template: string;
  syndicateId?: string | null;
  /** When available, attributes the email-log audit entry to the acting user. */
  req?: Request;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  logId?: string;
}

/**
 * Sends a single transactional email with retry-on-failure and full audit logging.
 * Never throws — callers (vote flows, election transitions, schedulers, etc.) must
 * not have their own operation fail because email delivery had a problem.
 */
export async function sendTransactionalEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const html = wrapEmail(opts.subject, opts.html);

  const [log] = await db
    .insert(emailLogsTable)
    .values({
      recipient: opts.to,
      subject: opts.subject,
      template: opts.template,
      status: "pending",
      syndicateId: opts.syndicateId ?? null,
      bodyHtml: html,
    })
    .returning();

  if (!smtpConfigured()) {
    // Dev / not-yet-configured fallback — never silently pretend success.
    logger.info({ to: opts.to, subject: opts.subject }, "[DEV] SMTP not configured — email logged, not delivered");
    console.info(`\n✉️  [not delivered — SMTP unconfigured] ${opts.to}: ${opts.subject}\n`);
    await finalizeLog(log.id, "failed", "SMTP not configured", 0);
    await auditEmail(opts, "failed");
    return { ok: false, error: "SMTP not configured", logId: log.id };
  }

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const transporter = await getTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: opts.to,
        subject: opts.subject,
        html,
      });
      await finalizeLog(log.id, "sent", null, attempt - 1);
      await auditEmail(opts, "sent");
      return { ok: true, logId: log.id };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      logger.warn({ err: lastError, attempt, to: opts.to }, "Email send attempt failed");
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS[attempt - 1] ?? 1500));
      }
    }
  }

  await finalizeLog(log.id, "failed", lastError ?? "Unknown error", MAX_ATTEMPTS - 1);
  await auditEmail(opts, "failed", lastError);
  return { ok: false, error: lastError, logId: log.id };
}

async function finalizeLog(id: string, status: "sent" | "failed", errorMessage: string | null, retryCount: number) {
  try {
    await db
      .update(emailLogsTable)
      .set({
        status,
        errorMessage,
        retryCount,
        sentAt: status === "sent" ? new Date() : null,
      })
      .where(eq(emailLogsTable.id, id));
  } catch (err) {
    logger.error({ err }, "Failed to update email_logs row");
  }
}

async function auditEmail(opts: SendEmailOptions, status: "sent" | "failed", error?: string) {
  try {
    if (opts.req?.user) {
      const { serverAuditLog } = await import("../audit.js");
      await serverAuditLog(opts.req, {
        action: status === "sent" ? "EMAIL_SENT" : "EMAIL_FAILED",
        entity: "email",
        details: `[${opts.template}] to ${opts.to}: ${opts.subject}${error ? ` — ${error}` : ""}`,
        syndicateId: opts.syndicateId ?? undefined,
      });
    } else {
      // System-triggered email (schedulers, background jobs) — no authenticated actor.
      await db.insert(auditLogsTable).values({
        userId: null,
        userName: "system",
        actorRole: "system",
        syndicateId: opts.syndicateId ?? null,
        isSupervision: false,
        action: status === "sent" ? "EMAIL_SENT" : "EMAIL_FAILED",
        entity: "email",
        details: `[${opts.template}] to ${opts.to}: ${opts.subject}${error ? ` — ${error}` : ""}`,
      });
    }
  } catch {
    // Non-blocking — audit failures must never break the send flow.
  }
}

/**
 * Re-sends a previously logged email using its stored rendered body.
 * Used by the admin Email Center's "retry" action.
 */
export async function retryEmailLog(logId: string): Promise<SendEmailResult> {
  const [log] = await db.select().from(emailLogsTable).where(eq(emailLogsTable.id, logId));
  if (!log) return { ok: false, error: "Email log introuvable" };
  if (!log.bodyHtml) return { ok: false, error: "Corps de l'email introuvable — impossible de renvoyer" };

  if (!smtpConfigured()) {
    return { ok: false, error: "SMTP not configured" };
  }

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const transporter = await getTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: log.recipient,
        subject: log.subject,
        html: log.bodyHtml,
      });
      await finalizeLog(log.id, "sent", null, (log.retryCount ?? 0) + attempt);
      return { ok: true, logId: log.id };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS[attempt - 1] ?? 1500));
      }
    }
  }

  await finalizeLog(log.id, "failed", lastError ?? "Unknown error", (log.retryCount ?? 0) + MAX_ATTEMPTS);
  return { ok: false, error: lastError, logId: log.id };
}
