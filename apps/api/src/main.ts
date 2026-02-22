import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser = require("cookie-parser");
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
    if (rule === "*") {
      return true;
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

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const slowRequestMs = Number(process.env.SLOW_REQUEST_LOG_MS || 400);
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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsRules = parseCorsRules();
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

  const port = Number(process.env.PORT || 4001);
  await app.listen(port);

  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
