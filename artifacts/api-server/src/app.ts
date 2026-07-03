import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import pinoHttp from "pino-http";
import compression from "compression";
import router from "./routes";
import { logger } from "./lib/logger";
import Redis from "ioredis";

const app: Express = express();

app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

// In production, ALLOWED_ORIGINS must be explicitly set. An empty list in production
// would silently permit any origin with credentials=true, which is a security risk.
if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  logger.warn(
    "ALLOWED_ORIGINS is not set in production — all origins are currently allowed. " +
    "Set ALLOWED_ORIGINS to a comma-separated list of permitted origins.",
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

function makeRedisStore() {
  if (!redis) return undefined;
  return new RedisStore({
    sendCommand: (...args: string[]) => {
      const [cmd, ...rest] = args;
      return (redis as Redis).call(cmd, ...rest) as Promise<number>;
    },
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Trop de tentatives de connexion. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore(),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { error: "Trop de requêtes. Réessayez dans une minute." },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore(),
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

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
