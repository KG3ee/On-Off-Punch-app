-- Performance indexes for time-sensitive attendance and break history queries.
CREATE INDEX IF NOT EXISTS "ShiftAssignment_targetType_targetId_isActive_effectiveFrom_idx"
ON "ShiftAssignment"("targetType", "targetId", "isActive", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "DutySession_userId_localDate_status_idx"
ON "DutySession"("userId", "localDate", "status");

CREATE INDEX IF NOT EXISTS "DutySession_localDate_status_idx"
ON "DutySession"("localDate", "status");

CREATE INDEX IF NOT EXISTS "BreakSession_userId_localDate_status_idx"
ON "BreakSession"("userId", "localDate", "status");

CREATE INDEX IF NOT EXISTS "BreakSession_localDate_status_idx"
ON "BreakSession"("localDate", "status");

CREATE INDEX IF NOT EXISTS "BreakSession_startedAt_idx"
ON "BreakSession"("startedAt");
