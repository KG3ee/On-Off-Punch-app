-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'READY_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "EmployeeRoster" (
    "id" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "phoneLast4" TEXT NOT NULL,
    "defaultTeamId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "phoneLast4" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "desiredUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "verificationScore" INTEGER NOT NULL DEFAULT 0,
    "verificationNotes" TEXT,
    "rosterEntryId" TEXT,
    "requestedTeamId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRoster_staffCode_key" ON "EmployeeRoster"("staffCode");

-- CreateIndex
CREATE INDEX "EmployeeRoster_defaultTeamId_idx" ON "EmployeeRoster"("defaultTeamId");

-- CreateIndex
CREATE INDEX "EmployeeRoster_isActive_idx" ON "EmployeeRoster"("isActive");

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_submittedAt_idx" ON "RegistrationRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "RegistrationRequest_desiredUsername_idx" ON "RegistrationRequest"("desiredUsername");

-- CreateIndex
CREATE INDEX "RegistrationRequest_staffCode_idx" ON "RegistrationRequest"("staffCode");

-- CreateIndex
CREATE INDEX "RegistrationRequest_requestedTeamId_idx" ON "RegistrationRequest"("requestedTeamId");

-- AddForeignKey
ALTER TABLE "EmployeeRoster" ADD CONSTRAINT "EmployeeRoster_defaultTeamId_fkey" FOREIGN KEY ("defaultTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "EmployeeRoster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_requestedTeamId_fkey" FOREIGN KEY ("requestedTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_approvedUserId_fkey" FOREIGN KEY ("approvedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
