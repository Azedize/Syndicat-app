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
import { emailLogsTable, auditLogsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { isReservedEmail } from "./deliverability.js";
import type { Request } from "express";
import { logger } from "../logger.js";
import { OUTBOUND_DISABLED_REASON, outboundDeliveryDisabled } from "../outbound.js";
import { wrapEmail, type EmailLang } from "./templates.js";

/** Templates whose body holds a secret: never stored, never re-sent from the log. */
export const SECRET_TEMPLATES = new Set(["password_reset", "otp", "email_change", "welcome", "team_invitation", "account_deleted"]);

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
  if (outboundDeliveryDisabled()) {
    logger.warn("Outbound delivery disabled (OUTBOUND_DELIVERY=off): no e-mail leaves this server.");
    return { ok: false, error: "delivery disabled" };
  }
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
  /** Language of the shell (footer, reading direction). Default: French. */
  lang?: EmailLang;
  /** Plain-text alternative; derived from the HTML when absent. */
  text?: string;
}

/** "MIZAN <address>" unless SMTP_FROM already carries a display name. */
function fromHeader(): string | undefined {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  if (!from || from.includes("<")) return from;
  const name = (process.env.SMTP_FROM_NAME ?? "MIZAN").replace(/["\r\n]/g, "");
  return `"${name}" <${from}>`;
}

/** Plain-text alternative of an HTML body (clients and spam filters expect one). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  logId?: string;
  /** Not attempted: the address cannot receive mail (reserved domain or marked undeliverable). */
  skipped?: boolean;
}

/** Why mail must not be sent to this address, or null when it may be. */
async function undeliverableReason(to: string): Promise<string | null> {
  if (isReservedEmail(to)) return "reserved domain";
  try {
    const [row] = await db
      .select({ status: usersTable.emailStatus })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = lower(${to})`)
      .limit(1);
    if (row?.status === "undeliverable") return "address marked undeliverable";
  } catch (err) {
    logger.warn({ err }, "email deliverability lookup failed");
  }
  return null;
}

/**
 * Sends a single transactional email with retry-on-failure and full audit logging.
 * Never throws — callers (vote flows, election transitions, schedulers, etc.) must
 * not have their own operation fail because email delivery had a problem.
 */
export async function sendTransactionalEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const html = wrapEmail(opts.subject, opts.html, opts.lang);
  const text = opts.text ?? htmlToText(opts.html);

  const [log] = await db
    .insert(emailLogsTable)
    .values({
      recipient: opts.to,
      subject: opts.subject,
      template: opts.template,
      status: "pending",
      syndicateId: opts.syndicateId ?? null,
      // A message carrying a secret (reset link, one-time code, temporary
      // password, invitation) is not kept: whoever reads the logs could use it.
      bodyHtml: SECRET_TEMPLATES.has(opts.template) ? null : html,
    })
    .returning();

  // Never write to an address that cannot receive mail: it bounces, hurts the
  // sender's reputation and, for look-alike test domains, may reach a third party.
  const skipReason = await undeliverableReason(opts.to);
  if (skipReason) {
    logger.info({ to: opts.to, subject: opts.subject, reason: skipReason }, "Email skipped — undeliverable address");
    await finalizeLog(log.id, "skipped", skipReason, 0);
    return { ok: false, skipped: true, error: "undeliverable", logId: log.id };
  }

  if (outboundDeliveryDisabled()) {
    logger.info({ to: opts.to, subject: opts.subject }, "Email skipped — outbound delivery disabled");
    await finalizeLog(log.id, "skipped", OUTBOUND_DISABLED_REASON, 0);
    return { ok: false, skipped: true, error: "delivery_disabled", logId: log.id };
  }

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
      const info = await transporter.sendMail({
        from: fromHeader(),
        to: opts.to,
        subject: opts.subject,
        html,
        text,
      });
      await finalizeLog(log.id, "sent", null, attempt - 1, providerReceipt(info));
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

/**
 * Meaning of email_logs.status (what was observed, nothing more):
 *   pending  — logged, the attempt has not finished (queued / in progress);
 *   sent     — the SMTP provider accepted the message; providerMessageId is
 *              its reply with its queue id (proof of acceptance — not of delivery to
 *              the mailbox, which the provider may still bounce later);
 *   failed   — every attempt was refused or errored (errorMessage says why);
 *   skipped  — not attempted on purpose: reserved / undeliverable address, or
 *              OUTBOUND_DELIVERY=off (test environment, a local simulation).
 */
/**
 * The provider's acceptance: its reply to the message (« 250 2.0.0 OK … » with
 * its queue id). sendMail only resolves after that reply; nodemailer's own
 * messageId is generated locally and proves nothing, so it is not used.
 */
function providerReceipt(info: { response?: string } | undefined): string | null {
  const r = info?.response?.trim();
  return r ? r.slice(0, 300) : null;
}

async function finalizeLog(id: string, status: "sent" | "failed" | "skipped", errorMessage: string | null, retryCount: number, providerMessageId: string | null = null) {
  try {
    await db
      .update(emailLogsTable)
      .set({
        status,
        errorMessage,
        retryCount,
        sentAt: status === "sent" ? new Date() : null,
        providerMessageId: status === "sent" ? providerMessageId : null,
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
  if (log.template && SECRET_TEMPLATES.has(log.template)) {
    return { ok: false, error: "Ce message contenait un code, un lien ou un mot de passe à usage unique : il n'est pas conservé. Demandez-en un nouveau." };
  }
  if (!log.bodyHtml) return { ok: false, error: "Corps de l'email introuvable — impossible de renvoyer" };
  if (outboundDeliveryDisabled()) return { ok: false, skipped: true, error: "delivery_disabled", logId: log.id };
  const skipReason = await undeliverableReason(log.recipient);
  if (skipReason) return { ok: false, skipped: true, error: "undeliverable", logId: log.id };

  if (!smtpConfigured()) {
    return { ok: false, error: "SMTP not configured" };
  }

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: fromHeader(),
        to: log.recipient,
        subject: log.subject,
        html: log.bodyHtml,
        text: htmlToText(log.bodyHtml),
      });
      await finalizeLog(log.id, "sent", null, (log.retryCount ?? 0) + attempt, providerReceipt(info));
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
