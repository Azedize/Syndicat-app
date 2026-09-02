import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { validateAuthConfig } from "./middleware/auth.js";
import { startContractExpiryScheduler } from "./lib/contract-expiry.js";
import { startEscalationScheduler } from "./lib/debt-escalation.js";
import { startElectionReminderScheduler } from "./lib/election-reminders.js";
import { startMandateExpiryScheduler } from "./lib/mandate-expiry.js";
import { startDocumentRetentionScheduler } from "./lib/document-retention-job.js";
import { startDocumentExpiryScheduler } from "./lib/document-expiry-job.js";
import { startSubscriptionReminderScheduler } from "./lib/subscription-reminders.js";
import { startOtpRetentionScheduler } from "./lib/otp-retention.js";
import { verifySmtpConnection } from "./lib/email/emailService.js";

// Fail fast on missing auth config — do not wait for first request
validateAuthConfig();

// Non-blocking SMTP health check — logs whether Gmail delivery is ready without
// preventing the API from starting if the mailbox is down/misconfigured.
verifySmtpConnection().catch(() => {});

// Periodically checks provider contracts nearing expiry (60/30/7 days) and sends alerts
startContractExpiryScheduler();

// Daily scan of unpaid charges — creates escalation records and notifies
startEscalationScheduler();

// Notifies voters who haven't voted yet as an election's voting window nears its close
startElectionReminderScheduler();

// Flips fixed-term conseil syndical mandates to "expired" once their term ends
startMandateExpiryScheduler();

// Daily retention-policy scan: notifies admins of documents nearing their legal
// retention expiry, and purges recycle-bin documents once retention + grace period
// have both elapsed. Dry-run by default (DOCUMENT_PURGE_DRY_RUN=false to enable).
startDocumentRetentionScheduler();

// Business-expiration scan: sends 30/15/7/1-day reminders and auto-flips
// documents to "expired" once their expiresAt date has passed.
startDocumentExpiryScheduler();

// Sends push + email alerts to syndicate admins 7, 3, and 1 day before their
// subscription expires (Scenario 7). After expiry, platform is read-only.
startSubscriptionReminderScheduler();

// Removes OTP records only after they are no longer needed for verification or
// the one-hour send-rate window.
startOtpRetentionScheduler();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown initiated");

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error closing HTTP server");
    } else {
      logger.info("HTTP server closed");
    }
    try {
      await pool.end();
      logger.info("DB pool closed");
    } catch (poolErr) {
      logger.error({ poolErr }, "Error closing DB pool");
    }
    process.exit(err ? 1 : 0);
  });

  setTimeout(() => {
    logger.warn("Graceful shutdown timeout — forcing exit");
    process.exit(1);
  }, 15_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
