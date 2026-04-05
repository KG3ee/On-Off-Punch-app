import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import cookieParser = require("cookie-parser");
import express = require("express");
import * as helmet from "helmet";
import { perUserRateLimiter } from "./common/middleware/per-user-rate-limiter";
import { AppModule } from "./app.module";

type CorsCallback = (err: Error | null, allow?: boolean) => void;
type RateLimitBucket = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitBucket>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCorsRules(): string[] {
  const raw = process.env.CORS_ORIGIN || "http://localhost:3000";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isAllowedOrigin(origin: string, rules: string[]): boolean {
  return rules.some((rule) => {
    // Reject wildcard CORS in all environments
    if (rule === "*") {
      console.error(
        "[SECURITY] Wildcard CORS origin (*) is rejected. Set CORS_ORIGIN to specific domains.",
      );
      return false;
    }

    if (!rule.includes("*")) {
      return rule === origin;
    }

    const regex = new RegExp(`^${escapeRegex(rule).replace(/\\\*/g, ".*")}$`);
    return regex.test(origin);
  });
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function getClientIp(request: any): string {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.ip || request.socket?.remoteAddress || "unknown";
}

function maybeSweepRateLimitStore(nowMs: number): void {
  if (rateLimitStore.size < 5000) return;
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= nowMs) {
      rateLimitStore.delete(key);
    }
  }
}

function createPostRateLimiter(options: {
  keyPrefix: string;
  max: number;
  windowMs: number;
}) {
  return (request: any, response: any, next: () => void) => {
    if (request.method !== "POST") {
      next();
      return;
    }

    const nowMs = Date.now();
    maybeSweepRateLimitStore(nowMs);

    const ip = getClientIp(request);
    const key = `${options.keyPrefix}:${ip}`;
    const current = rateLimitStore.get(key);

    if (!current || current.resetAt <= nowMs) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: nowMs + options.windowMs,
      });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.resetAt - nowMs) / 1000),
      );
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        message: "Too many requests. Please try again later.",
      });
      return;
    }

    rateLimitStore.set(key, current);
    next();
  };
}

function configureApplication(app: INestApplication): void {
  const bodyLimit = process.env.BODY_LIMIT || "2mb";
  const slowRequestMs = Number(process.env.SLOW_REQUEST_LOG_MS || 400);

  // Security headers via Helmet (CSP deferred to edge proxy / Vercel config)
  app.use(
    (helmet as any).default({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const loginRateLimitMax = parsePositiveInt(
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX,
    8,
  );
  const loginRateLimitWindowMs = parsePositiveInt(
    process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
    60_000,
  );
  const registrationRateLimitMax = parsePositiveInt(
    process.env.REGISTRATION_RATE_LIMIT_MAX,
    5,
  );
  const registrationRateLimitWindowMs = parsePositiveInt(
    process.env.REGISTRATION_RATE_LIMIT_WINDOW_MS,
    60_000,
  );

  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

  app.use((req: any, res: any, next: () => void) => {
    const startAt = process.hrtime.bigint();
    res.on("finish", () => {
      const endAt = process.hrtime.bigint();
      const durationMs = Number(endAt - startAt) / 1_000_000;
      if (durationMs >= slowRequestMs) {
        console.warn(
          `[SLOW] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
        );
      }
    });
    next();
  });

  app.use(cookieParser());
  app.use(
    "/auth/login",
    createPostRateLimiter({
      keyPrefix: "auth-login",
      max: loginRateLimitMax,
      windowMs: loginRateLimitWindowMs,
    }),
  );
  app.use(
    "/auth/register-request",
    createPostRateLimiter({
      keyPrefix: "auth-register-request",
      max: registrationRateLimitMax,
      windowMs: registrationRateLimitWindowMs,
    }),
  );

  // Per-user rate limiting for authenticated mutating endpoints.
  // These run after cookie parsing so JWT can be decoded for user-ID keying.
  // Punch/break operations: generous enough for offline queue replay (5s intervals)
  app.use(
    "/attendance",
    perUserRateLimiter({ max: 30, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/breaks",
    perUserRateLimiter({ max: 30, windowMs: 5 * 60 * 1000 }),
  );
  // General mutating endpoints: moderate limits
  app.use(
    "/driver-requests",
    perUserRateLimiter({ max: 40, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/violations",
    perUserRateLimiter({ max: 30, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/leader",
    perUserRateLimiter({ max: 60, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/notifications",
    perUserRateLimiter({ max: 40, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/shifts",
    perUserRateLimiter({ max: 30, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/teams",
    perUserRateLimiter({ max: 20, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/me",
    perUserRateLimiter({ max: 20, windowMs: 5 * 60 * 1000 }),
  );
  app.use(
    "/admin",
    perUserRateLimiter({ max: 60, windowMs: 5 * 60 * 1000 }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsRules = parseCorsRules();

  // Reject wildcard CORS at startup
  if (corsRules.includes("*")) {
    console.error(
      "[SECURITY] CORS_ORIGIN contains wildcard (*) which is not allowed. Please set specific domain(s).",
    );
  }

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback) => {
      if (!origin || isAllowedOrigin(origin, corsRules)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  });
}

export async function buildNestApplication(
  server?: express.Express,
): Promise<INestApplication> {
  const app = server
    ? await NestFactory.create(AppModule, new ExpressAdapter(server), {
        bodyParser: false,
      })
    : await NestFactory.create(AppModule, {
        bodyParser: false,
      });

  configureApplication(app);
  return app;
}

export async function createVercelServer(): Promise<express.Express> {
  const server = express();
  const app = await buildNestApplication(server);
  await app.init();
  return server;
}
