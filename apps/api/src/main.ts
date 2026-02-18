import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

type CorsCallback = (err: Error | null, allow?: boolean) => void;

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

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
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
