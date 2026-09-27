import { db } from "@workspace/db";
import { otpTokensTable } from "@workspace/db/schema";
import { lt } from "drizzle-orm";
import { logger } from "./logger.js";
import { scheduleJob } from "./scheduler.js";

const OTP_RETENTION_MS = 2 * 60 * 60 * 1_000;
const OTP_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;

export async function cleanupExpiredOtpTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - OTP_RETENTION_MS);
  const deleted = await db
    .delete(otpTokensTable)
    .where(lt(otpTokensTable.createdAt, cutoff))
    .returning({ id: otpTokensTable.id });

  if (deleted.length > 0) {
    logger.info({ deleted: deleted.length }, "Expired OTP records cleaned up");
  }
}

export function startOtpRetentionScheduler(): void {
  // Claimed per run in scheduled_job_runs: executes once per interval
  // across all API instances, and not again on every restart.
  scheduleJob("otp-retention", OTP_CLEANUP_INTERVAL_MS, cleanupExpiredOtpTokens);
}
