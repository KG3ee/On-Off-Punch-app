export type AttendanceRefreshSession = {
  id: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  isLate?: boolean;
  lateMinutes?: number;
  overtimeMinutes?: number;
};

export type PunchOffSummary = {
  workedMinutes: number;
  shiftMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  punchedOnAt: string;
  punchedOffAt: string;
  autoClosedBreakCount: number;
};

export type PunchOffResult = AttendanceRefreshSession & {
  workedMinutes: number;
  breakMinutes: number;
  autoClosedBreakIds: string[];
  punchOffSummary: PunchOffSummary;
  dutySessionId?: string;
  clientDutySessionRef?: string | null;
  syncStatus?: 'APPLIED' | 'IDEMPOTENT' | 'STALE';
  syncReason?: string | null;
};

export type AttendanceRefreshDetail = {
  path: '/attendance/on' | '/attendance/off';
  session: AttendanceRefreshSession;
  summary?: PunchOffSummary;
};
