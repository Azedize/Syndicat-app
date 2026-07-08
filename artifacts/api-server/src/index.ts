import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { validateAuthConfig } from "./middleware/auth.js";
import { startContractExpiryScheduler } from "./lib/contract-expiry.js";
import { startEscalationScheduler } from "./lib/debt-escalation.js";

// Fail fast on missing auth config — do not wait for first request
validateAuthConfig();

// Periodically checks provider contracts nearing expiry (60/30/7 days) and sends alerts
startContractExpiryScheduler();

// Daily scan of unpaid charges — creates escalation records and notifies
startEscalationScheduler();

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
