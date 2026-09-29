import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { emailLogsTable } from "@workspace/db/schema";
import { eq, and, desc, ilike, or, count, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import {
  sendTransactionalEmail,
  retryEmailLog,
  verifySmtpConnection,
} from "../lib/email/emailService.js";
import { testEmailTemplate } from "../lib/email/templates.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// POST /test-email — admins verify SMTP delivery end to end. Not open to every
// user: each call consumes the shared SMTP sending quota (Gmail ≈500/day).
router.post("/test-email", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subject, html } = testEmailTemplate(req.user!.name);
    const result = await sendTransactionalEmail({
      to: req.user!.email,
      subject,
      html,
      template: "test_email",
      syndicateId: req.user!.syndicateId ?? null,
      req,
    });

    if (result.ok) {
      res.json({
        data: { sent: true, logId: result.logId },
        message: `Email de test envoyé à ${req.user!.email}`,
      });
    } else {
      res.status(502).json({
        error: result.error ?? "Échec de l'envoi de l'email de test",
        data: { sent: false, logId: result.logId },
      });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /email-logs — admin-only, paginated, filterable Email Center list.
router.get("/email-logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pagination = getPagination(req);
    const { limit, offset } = pagination;
    const { status, template, search } = req.query as Record<string, string>;
    const user = req.user!;
    if (user.role === "syndicate_admin" && !user.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    const requestedSyndicateId =
      typeof req.query.syndicateId === "string"
        ? req.query.syndicateId
        : undefined;
    if (
      user.role === "super_admin" &&
      requestedSyndicateId &&
      req.query.supervision !== "true"
    ) {
      res.status(403).json({
        error:
          "Les Super Admins doivent activer le mode supervision pour cibler un syndicat.",
        code: "SUPERVISION_REQUIRED",
      });
      return;
    }

    const conditions = [
      status ? eq(emailLogsTable.status, status) : undefined,
      template ? eq(emailLogsTable.template, template) : undefined,
      search
        ? or(
            ilike(emailLogsTable.recipient, `%${search}%`),
            ilike(emailLogsTable.subject, `%${search}%`),
          )
        : undefined,
      // syndicate_admin only sees their own syndicate's emails; super_admin sees all
      // (or a specific syndicate via ?syndicateId= for supervision mode).
      user.role === "syndicate_admin"
        ? eq(emailLogsTable.syndicateId, user.syndicateId ?? "")
        : requestedSyndicateId
          ? eq(emailLogsTable.syndicateId, requestedSyndicateId)
          : undefined,
    ].filter(Boolean);

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: emailLogsTable.id,
          recipient: emailLogsTable.recipient,
          subject: emailLogsTable.subject,
          template: emailLogsTable.template,
          status: emailLogsTable.status,
          errorMessage: emailLogsTable.errorMessage,
          retryCount: emailLogsTable.retryCount,
          syndicateId: emailLogsTable.syndicateId,
          sentAt: emailLogsTable.sentAt,
          createdAt: emailLogsTable.createdAt,
        })
        .from(emailLogsTable)
        .where(where)
        .orderBy(desc(emailLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(emailLogsTable).where(where),
    ]);

    res.json(buildPagedResponse(rows, total, pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /email-logs/stats — admin-only delivery statistics for the Email Center dashboard.
router.get("/email-logs/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "syndicate_admin" && !user.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    const requestedSyndicateId =
      typeof req.query.syndicateId === "string"
        ? req.query.syndicateId
        : undefined;
    if (
      user.role === "super_admin" &&
      requestedSyndicateId &&
      req.query.supervision !== "true"
    ) {
      res.status(403).json({
        error:
          "Les Super Admins doivent activer le mode supervision pour cibler un syndicat.",
        code: "SUPERVISION_REQUIRED",
      });
      return;
    }
    const scope =
      user.role === "syndicate_admin"
        ? eq(emailLogsTable.syndicateId, user.syndicateId ?? "")
        : requestedSyndicateId
          ? eq(emailLogsTable.syndicateId, requestedSyndicateId)
          : undefined;

    const rows = await db
      .select({ status: emailLogsTable.status, n: count() })
      .from(emailLogsTable)
      .where(scope)
      .groupBy(emailLogsTable.status);

    const sent = rows.find((r) => r.status === "sent")?.n ?? 0;
    const failed = rows.find((r) => r.status === "failed")?.n ?? 0;
    const pending = rows.find((r) => r.status === "pending")?.n ?? 0;
    const total = sent + failed + pending;

    const [last24h] = await db
      .select({ n: count() })
      .from(emailLogsTable)
      .where(
        scope
          ? and(
              scope,
              gte(
                emailLogsTable.createdAt,
                new Date(Date.now() - 24 * 3600 * 1000),
              ),
            )
          : gte(
              emailLogsTable.createdAt,
              new Date(Date.now() - 24 * 3600 * 1000),
            ),
      );

    res.json({
      data: {
        total,
        sent,
        failed,
        pending,
        deliveryRate: total > 0 ? Math.round((sent / total) * 100) : 100,
        last24h: last24h?.n ?? 0,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /email-logs/:id/retry — admin-only manual retry of a failed email.
router.post(
  "/email-logs/:id/retry",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const user = req.user!;
      if (user.role === "syndicate_admin" && !user.syndicateId) {
        res.status(403).json({ error: "Syndicat non défini dans le token" });
        return;
      }
      const scope =
        user.role === "syndicate_admin"
          ? eq(emailLogsTable.syndicateId, user.syndicateId!)
          : undefined;
      const [log] = await db
        .select()
        .from(emailLogsTable)
        .where(
          scope
            ? and(eq(emailLogsTable.id, String(req.params.id)), scope)
            : eq(emailLogsTable.id, String(req.params.id)),
        );
      if (!log) {
        res.status(404).json({ error: "Email introuvable" });
        return;
      }

      const result = await retryEmailLog(log.id);

      await serverAuditLog(req, {
        action: "RETRY",
        entity: "email",
        entityId: log.id,
        details: `Retry ${log.recipient}: ${result.ok ? "success" : result.error}`,
        syndicateId: log.syndicateId ?? undefined,
      });

      if (result.ok) {
        res.json({
          data: { sent: true },
          message: "Email renvoyé avec succès",
        });
      } else {
        res.status(502).json({
          error: result.error ?? "Échec du renvoi",
          data: { sent: false },
        });
      }
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// GET /email-config/status — admin-only SMTP connection health check (used by the
// Email Center to show a live "connected/disconnected" indicator).
router.get(
  "/email-config/status",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const result = await verifySmtpConnection();
    res.json({
      data: {
        configured: !!process.env.SMTP_HOST,
        connected: result.ok,
        error: result.error,
        host: process.env.SMTP_HOST ?? null,
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? null,
      },
    });
  },
);

export default router;
