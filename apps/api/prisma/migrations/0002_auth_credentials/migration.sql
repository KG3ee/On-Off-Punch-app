-- Add username/password auth fields and remove Telegram-only login field.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

-- Backfill usernames for legacy rows that were null/blank.
UPDATE "User"
SET "username" = CASE
  WHEN COALESCE(NULLIF("telegramId", ''), '') <> '' THEN 'tg_' || "telegramId"
  ELSE 'user_' || substring("id" from 1 for 8)
END
WHERE "username" IS NULL OR "username" = '';

-- Resolve any duplicates produced by fallback generation.
WITH duplicates AS (
  SELECT
    "id",
    "username",
    ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = u."username" || '_' || duplicates.rn
FROM duplicates
WHERE u."id" = duplicates."id" AND duplicates.rn > 1;

-- Backfill password hash with a temporary credential hash (TempPass123!).
UPDATE "User"
SET "passwordHash" = '$2b$12$1gV5JEs/nn84o5RktQhzrelBxuGAkQbBA8HXChqM/YC6kdmiOMDF.'
WHERE "passwordHash" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "username" SET NOT NULL,
  ALTER COLUMN "passwordHash" SET NOT NULL;

DROP INDEX IF EXISTS "User_telegramId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramId";

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
