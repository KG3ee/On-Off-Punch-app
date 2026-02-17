export type Role = "ADMIN" | "EMPLOYEE";

export type AssignmentTargetType = "TEAM" | "USER";

export interface ShiftSegmentInput {
  id: string;
  segmentNo: number;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  crossesMidnight: boolean;
  lateGraceMinutes: number;
}

export interface ShiftPresetInput {
  id: string;
  name: string;
  teamId?: string | null;
  segments: ShiftSegmentInput[];
}

export interface ShiftAssignmentInput {
  id: string;
  targetType: AssignmentTargetType;
  targetId: string;
  shiftPresetId: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD
}

export interface ShiftOverrideInput {
  id: string;
  targetType: AssignmentTargetType;
  targetId: string;
  shiftPresetId: string;
  overrideDate: string; // YYYY-MM-DD
}

export interface ResolvedShiftSegment {
  presetId: string;
  presetName: string;
  segmentId: string;
  segmentNo: number;
  shiftDate: string; // YYYY-MM-DD anchor date
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  lateGraceMinutes: number;
  scheduleStartLocal: string; // YYYY-MM-DDTHH:mm
  scheduleEndLocal: string; // YYYY-MM-DDTHH:mm
  isLateAt: (now: Date, timeZone: string) => boolean;
}

export interface PayrollRuleSnapshot {
  name: string;
  baseHourlyRate: number;
  overtimeMultiplier: number;
  latePenaltyPerMinute: number;
  breakDeductionMode: "NONE" | "UNPAID_ALL_BREAKS" | "UNPAID_OVERTIME_ONLY";
}

export interface PayrollComputationInput {
  employeeId: string;
  employeeName: string;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  rule: PayrollRuleSnapshot;
}

export interface PayrollComputationResult {
  employeeId: string;
  employeeName: string;
  payableMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  grossPay: number;
  latePenalty: number;
  finalPay: number;
  metadata: {
    workedMinutes: number;
    breakMinutes: number;
    lateMinutes: number;
    breakDeductionMode: PayrollRuleSnapshot["breakDeductionMode"];
  };
}
