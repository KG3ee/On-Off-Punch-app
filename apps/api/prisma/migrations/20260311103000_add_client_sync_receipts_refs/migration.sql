CREATE TABLE "ClientActionReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientDeviceId" TEXT NOT NULL,
  "clientActionId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "clientTimestamp" TIMESTAMP(3),
  "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL,
  "rejectionReason" TEXT,
  "resolvedDutySessionId" TEXT,
  "resolvedBreakSessionId" TEXT,
  "responseJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientActionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientRefMapping" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientDeviceId" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "clientRef" TEXT NOT NULL,
  "dutySessionId" TEXT,
  "breakSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientRefMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientActionReceipt_userId_clientDeviceId_clientActionId_key" ON "ClientActionReceipt"("userId", "clientDeviceId", "clientActionId");
CREATE INDEX "ClientActionReceipt_userId_clientDeviceId_createdAt_idx" ON "ClientActionReceipt"("userId", "clientDeviceId", "createdAt");
CREATE INDEX "ClientActionReceipt_resolvedDutySessionId_idx" ON "ClientActionReceipt"("resolvedDutySessionId");
CREATE INDEX "ClientActionReceipt_resolvedBreakSessionId_idx" ON "ClientActionReceipt"("resolvedBreakSessionId");

CREATE UNIQUE INDEX "ClientRefMapping_userId_clientDeviceId_refType_clientRef_key" ON "ClientRefMapping"("userId", "clientDeviceId", "refType", "clientRef");
CREATE INDEX "ClientRefMapping_dutySessionId_idx" ON "ClientRefMapping"("dutySessionId");
CREATE INDEX "ClientRefMapping_breakSessionId_idx" ON "ClientRefMapping"("breakSessionId");

ALTER TABLE "ClientActionReceipt"
ADD CONSTRAINT "ClientActionReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientRefMapping"
ADD CONSTRAINT "ClientRefMapping_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
