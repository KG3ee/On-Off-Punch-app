-- AlterTable: Add shift times to Team
ALTER TABLE "Team" ADD COLUMN "shiftStartTime" TEXT;
ALTER TABLE "Team" ADD COLUMN "shiftEndTime" TEXT;

-- AlterTable: Add overtime tracking to DutySession
ALTER TABLE "DutySession" ADD COLUMN "overtimeMinutes" INTEGER NOT NULL DEFAULT 0;
