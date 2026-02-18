-- CreateEnum
CREATE TYPE "ShiftRequestType" AS ENUM ('HALF_DAY_MORNING', 'HALF_DAY_EVENING', 'FULL_DAY_OFF', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "ShiftChangeRequest" DROP CONSTRAINT "ShiftChangeRequest_shiftPresetId_fkey";

-- AlterTable
ALTER TABLE "ShiftChangeRequest" ADD COLUMN     "requestType" "ShiftRequestType" NOT NULL DEFAULT 'CUSTOM',
ALTER COLUMN "shiftPresetId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_shiftPresetId_fkey" FOREIGN KEY ("shiftPresetId") REFERENCES "ShiftPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
