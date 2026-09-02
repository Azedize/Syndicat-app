import { db } from "@workspace/db";
import { otpTokensTable } from "@workspace/db/schema";
import { lt } from "drizzle-orm";
import { logger } from "./logger.js";

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
  cleanupExpiredOtpTokens().catch((error) => {
    logger.warn({ error }, "Initial OTP cleanup failed");
  });

  setInterval(() => {
    cleanupExpiredOtpTokens().catch((error) => {
      logger.warn({ error }, "Scheduled OTP cleanup failed");
    });
  }, OTP_CLEANUP_INTERVAL_MS);

  logger.info("OTP retention scheduler started");
}