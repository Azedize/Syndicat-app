import { db } from "@workspace/db";
import { scheduledJobRunsTable } from "@workspace/db/schema";
import { eq, lt } from "drizzle-orm";
import { logger } from "./logger.js";

/** How often each instance checks whether a job is due. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Atomically claims the next run of `name`: succeeds for exactly one caller
 * (across all API instances) once `intervalMs` has elapsed since the last run.
 */
async function claimRun(name: string, intervalMs: number): Promise<boolean> {
  const now = new Date();
  const claimed = await db
    .insert(scheduledJobRunsTable)
    .values({ name, lastRunAt: now, lastStatus: "running" })
    .onConflictDoUpdate({
      target: scheduledJobRunsTable.name,
      set: { lastRunAt: now, lastStatus: "running", lastError: null },
      where: lt(
        scheduledJobRunsTable.lastRunAt,
        new Date(now.getTime() - intervalMs),
      ),
    })
    .returning({ name: scheduledJobRunsTable.name });
  return claimed.length > 0;
}

/**
 * Runs `job` once per `intervalMs` platform-wide. Every instance polls, but
 * only the instance that claims the run executes it; the outcome is recorded
 * in scheduled_job_runs for observability. Errors are logged, never thrown.
 */
export function scheduleJob(
  name: string,
  intervalMs: number,
  job: () => Promise<unknown>,
): void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (!(await claimRun(name, intervalMs))) return;
      const started = Date.now();
      try {
        await job();
        await db
          .update(scheduledJobRunsTable)
          .set({ lastStatus: "succeeded", lastDurationMs: Date.now() - started })
          .where(eq(scheduledJobRunsTable.name, name));
      } catch (err: any) {
        logger.warn({ err, job: name }, "Scheduled job failed");
        await db
          .update(scheduledJobRunsTable)
          .set({
            lastStatus: "failed",
            lastError: String(err?.message ?? err).slice(0, 500),
            lastDurationMs: Date.now() - started,
          })
          .where(eq(scheduledJobRunsTable.name, name));
      }
    } catch (err) {
      logger.warn({ err, job: name }, "Scheduled job claim failed");
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(tick, Math.min(POLL_INTERVAL_MS, intervalMs)).unref();
  logger.info({ job: name, intervalMs }, "Scheduled job registered");
}
