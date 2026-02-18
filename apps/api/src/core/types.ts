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
