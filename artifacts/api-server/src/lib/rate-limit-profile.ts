/**
 * Rate-limit thresholds.
 *
 * Production (the default, always): 60 credential requests per IP and 10 login
 * attempts per account per 15 minutes, 500 API requests per minute.
 *
 * The automated suites log in hundreds of times from one machine, so run
 * back-to-back they hit the per-IP limit and fail with 429 for no code
 * reason. A « test » profile raises the thresholds — the limiters stay on —
 * and is honoured ONLY when all of these hold:
 *   - RATE_LIMIT_PROFILE=test is set explicitly;
 *   - NODE_ENV is not « production »;
 *   - the API is connected to the isolated test database `syndycat_test`
 *     on a local host.
 * Anything else (another database, a remote host, production) gets the
 * production thresholds, whatever the variable says.
 */
export type RateLimitProfile = {
  name: "production" | "test";
  credentialPerIp: number;
  loginPerAccount: number;
  apiPerMinute: number;
};

export const PRODUCTION_LIMITS: RateLimitProfile = { name: "production", credentialPerIp: 60, loginPerAccount: 10, apiPerMinute: 500 };
const TEST_LIMITS: RateLimitProfile = { name: "test", credentialPerIp: 5000, loginPerAccount: 500, apiPerMinute: 20000 };
const TEST_DATABASE = "syndycat_test";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function rateLimitProfile(env: Record<string, string | undefined> = process.env): RateLimitProfile {
  if (env.RATE_LIMIT_PROFILE !== "test" || env.NODE_ENV === "production") return PRODUCTION_LIMITS;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (!LOCAL_HOSTS.has(url.hostname) || url.pathname.replace(/^\//, "") !== TEST_DATABASE) return PRODUCTION_LIMITS;
  } catch {
    return PRODUCTION_LIMITS;
  }
  return TEST_LIMITS;
}
