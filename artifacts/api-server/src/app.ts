import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import pinoHttp from "pino-http";
import compression from "compression";
import router from "./routes";
import { logger } from "./lib/logger";
import { softAuth } from "./middleware/auth.js";
import Redis from "ioredis";
import { processStripeWebhook } from "./lib/stripeWebhook.js";

const app: Express = express();

app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

// In production, ALLOWED_ORIGINS must be explicitly set.
// An empty list in production with credentials=true would permit any origin — hard-fail here.
if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error(
    "FATAL: ALLOWED_ORIGINS environment variable must be set in production. " +
    "Set it to a comma-separated list of permitted origins (e.g. https://app.mizan.ma). " +
    "Refusing to start with open CORS + credentials=true.",
  );
}

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / non-browser requests
      if (allowedOrigins.length === 0) return callback(null, true); // dev: allow all
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("CORS: origine non autorisée"));
    },
    credentials: true,
  }),
);

// Gzip/Brotli compression for all responses
app.use(compression({ threshold: 1024 }));

// Redis client (optional — falls back to memory if REDIS_URL is not set)
let redis: Redis | null = null;
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });
  redis.on("error", (err: Error) => {
    logger.warn({ err: err.message }, "Redis unavailable — rate limiting uses memory store");
  });
}

// Each limiter needs its own key prefix, otherwise counters of different
// limiters overwrite each other in Redis.
function makeRedisStore(prefix: string) {
  if (!redis) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => {
      const [cmd, ...rest] = args;
      return (redis as Redis).call(cmd, ...rest) as Promise<number>;
    },
  });
}

// Strict limits apply only to credential-handling endpoints. Session
// endpoints (/auth/me, /auth/refresh, /auth/logout) are called routinely by
// every client and stay under the general API limiter — otherwise residents
// sharing one public IP (building Wi-Fi, mobile carrier NAT) lock each other out.
const CREDENTIAL_ENDPOINTS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/change-password",
  "/api/auth/otp",
  "/api/auth/sms",
  "/api/auth/verify-phone",
];

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore("rl:cred:"),
});

// Per-account brute-force protection, independent of the source IP.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Trop de tentatives de connexion pour ce compte. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email ? `acct:${email}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  store: makeRedisStore("rl:login:"),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { error: "Trop de requêtes. Réessayez dans une minute." },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore("rl:api:"),
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Stripe requires the exact raw request body for signature verification.
// This route must stay before express.json().
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) {
    res.status(400).json({ error: "Signature Stripe manquante ou invalide" });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Corps webhook Stripe invalide" });
    return;
  }
  try {
    await processStripeWebhook(req.body, signature);
    res.json({ received: true });
  } catch (error: any) {
    logger.warn({ error: error?.message }, "Stripe webhook rejected");
    res.status(400).json({ error: "Webhook Stripe invalide" });
  }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ─── Query / response timeout (30 s) ──────────────────────────────────────────
// Prevents long-running handlers from holding connections open indefinitely.
const REQUEST_TIMEOUT_MS = 30_000;
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Délai de traitement dépassé" });
    }
  });
  next();
});

app.use(CREDENTIAL_ENDPOINTS, credentialLimiter);
app.use("/api/auth/login", loginAccountLimiter);
app.use("/api", apiLimiter);

// Soft JWT decode — populates req.user from the bearer token when present.
// This runs before route handlers so subscription enforcement middleware can
// read req.user for write-method checks without requiring auth to be global.
app.use(softAuth);

app.use("/api", router);

// ─── Global async error handler ───────────────────────────────────────────────
// Catches any error thrown/rejected in route handlers (including async ones).
// Without this, unhandled promise rejections leave the connection hanging.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const log = (req as any).log ?? logger;
  log.error({ err: err.message, stack: err.stack }, "Unhandled route error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Erreur serveur inattendue" });
});

export default app;
