/**
 * Subscription Expiry Reminder Scheduler — Scenario 7
 *
 * Sends push notifications and in-app alerts to syndicate admins when their
 * subscription is about to expire:
 *   - 7 days before expiry
 *   - 3 days before expiry
 *   - 1 day before expiry
 *
 * After expiry, the platform switches to READ-ONLY mode (enforced by
 * requireActiveSubscription middleware in routes/index.ts). Data is never deleted.
 *
 * Deduplication: checked by querying the alerts table for an existing alert
 * with the same syndicateId + title pattern for this threshold, so the same
 * reminder is never sent twice.
 */

import { db } from "@workspace/db";
import {
  syndicateSubscriptionsTable,
  syndicatesTable,
  usersTable,
  alertsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createAlert, sendEmail, sendPushToUsers } from "./notify.js";
import { logger } from "./logger.js";
import { scheduleJob } from "./scheduler.js";

const REMINDER_THRESHOLDS_DAYS = [7, 3, 1] as const;

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryDate(row: {
  status: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
}): Date | null {
  if (row.status === "trial") return row.trialEndDate;
  if (row.status === "active") return row.currentPeriodEnd;
  return null;
}

/** True if we already sent a reminder at this threshold for this syndicate today. */
async function alreadySentReminder(syndicateId: string, daysLeft: number): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0]!;
  const titlePattern = daysLeft === 1
    ? "⚠️ Abonnement expire demain !"
    : `⏰ Abonnement expire dans ${daysLeft} jours`;

  const existing = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.syndicateId, syndicateId),
        eq(alertsTable.title, titlePattern),
        eq(alertsTable.date, today),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

async function getSyndicateAdminIds(syndicateId: string): Promise<string[]> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.syndicateId, syndicateId),
        eq(usersTable.role, "syndicate_admin"),
      ),
    );
  return rows.map((r) => r.id);
}

async function getSyndicateAdminEmails(syndicateId: string): Promise<string[]> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.syndicateId, syndicateId),
        eq(usersTable.role, "syndicate_admin"),
      ),
    );
  return rows.map((r) => r.email).filter((e): e is string => !!e);
}

function buildReminderHtml(syndicateName: string, daysLeft: number, planName: string | null): string {
  const color = daysLeft === 1 ? "#ef4444" : daysLeft === 3 ? "#f59e0b" : "#2563EB";
  return `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="background:${color};border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center;">
    <p style="color:rgba(255,255,255,0.85);font-size:12px;margin:0 0 4px;">${syndicateName}</p>
    <h2 style="color:#fff;font-size:28px;margin:0;">J-${daysLeft}</h2>
    <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">
      Votre abonnement ${planName ? `"${planName}"` : ""} expire dans
      <strong>${daysLeft} jour${daysLeft > 1 ? "s" : ""}</strong>.
    </p>
  </div>
  <p style="color:#374151;font-size:14px;line-height:1.6;">
    Après expiration, la plateforme passera en <strong>mode lecture seule</strong>.
    Vous pourrez toujours consulter vos données, mais la création de documents,
    réunions, factures et nouveaux workflows sera suspendue.
  </p>
  <p style="color:#374151;font-size:14px;line-height:1.6;">
    Renouvelez maintenant pour maintenir un accès complet à tous vos outils.
  </p>
  <div style="text-align:center;margin-top:24px;">
    <a href="/abonnements" style="background:${color};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      Renouveler mon abonnement
    </a>
  </div>
  <p style="color:#9ca3af;font-size:11px;margin-top:24px;text-align:center;">
    MIZAN — Syndicat de Copropriété · Loi 18-00
  </p>
</div>`;
}

async function runSubscriptionReminderScan(): Promise<void> {
  try {
    const rows = await db
      .select({
        id: syndicateSubscriptionsTable.id,
        syndicateId: syndicateSubscriptionsTable.syndicateId,
        status: syndicateSubscriptionsTable.status,
        trialEndDate: syndicateSubscriptionsTable.trialEndDate,
        currentPeriodEnd: syndicateSubscriptionsTable.currentPeriodEnd,
        syndicateName: syndicatesTable.name,
      })
      .from(syndicateSubscriptionsTable)
      .leftJoin(syndicatesTable, eq(syndicateSubscriptionsTable.syndicateId, syndicatesTable.id))
      .where(
        inArray(syndicateSubscriptionsTable.status, ["trial", "active"]),
      );

    for (const row of rows) {
      const expiryDate = getExpiryDate(row as any);
      if (!expiryDate) continue;

      const days = daysUntil(expiryDate);
      if (!(REMINDER_THRESHOLDS_DAYS as readonly number[]).includes(days)) continue;

      const syndicateId = row.syndicateId ?? "";
      if (!syndicateId) continue;

      // Deduplication: skip if we already sent this threshold alert today
      if (await alreadySentReminder(syndicateId, days)) continue;

      const syndicateName = row.syndicateName ?? "Votre Syndicat";
      const alertTitle = days === 1
        ? "⚠️ Abonnement expire demain !"
        : `⏰ Abonnement expire dans ${days} jours`;

      // 1. Create in-app alert (visible in the mobile notifications screen)
      await createAlert({
        title: alertTitle,
        message:
          `Renouvelez votre abonnement pour maintenir l'accès complet à MIZAN. ` +
          `Après expiration: mode lecture seule.`,
        type: days === 1 ? "error" : "warning",
        syndicateId,
        target: "admin",
      });

      // 2. Push notification to all syndicate admins
      const adminIds = await getSyndicateAdminIds(syndicateId);
      if (adminIds.length > 0) {
        await sendPushToUsers(
          adminIds,
          alertTitle,
          `Votre abonnement MIZAN expire dans ${days} jour${days > 1 ? "s" : ""}. Renouvelez maintenant.`,
          { syndicateId, type: "subscription_expiry", daysLeft: days },
        );
      }

      // 3. Email all syndicate admins
      const adminEmails = await getSyndicateAdminEmails(syndicateId);
      const subject = days === 1
        ? `[MIZAN] ⚠️ Votre abonnement expire demain — ${syndicateName}`
        : `[MIZAN] Rappel abonnement — J-${days} — ${syndicateName}`;
      const html = buildReminderHtml(syndicateName, days, null);
      for (const email of adminEmails) {
        await sendEmail(email, subject, html, "subscription_reminder", syndicateId);
      }

      logger.info(
        { syndicateId, daysLeft: days, syndicateName },
        "Subscription expiry reminder sent",
      );
    }
  } catch (err) {
    logger.error({ err }, "Subscription reminder scan failed");
  }
}

export function startSubscriptionReminderScheduler(): void {
  // Claimed per run in scheduled_job_runs: executes once per interval
  // across all API instances, and not again on every restart.
  scheduleJob("subscription-reminders", 24 * 60 * 60 * 1000, runSubscriptionReminderScan);
}
