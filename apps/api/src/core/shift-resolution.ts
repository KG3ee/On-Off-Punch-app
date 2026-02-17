import { ResolvedShiftSegment, ShiftPresetInput } from './types';
import {
  formatDateInZone,
  getPreviousDateInZone,
  localDateTime,
  minutesNowInZone,
  parseTimeToMinutes
} from './time';

export function resolveActiveShiftSegment(
  preset: ShiftPresetInput,
  now: Date,
  timeZone: string
): ResolvedShiftSegment | null {
  const nowMinutes = minutesNowInZone(now, timeZone);
  const today = formatDateInZone(now, timeZone);
  const yesterday = getPreviousDateInZone(now, timeZone);

  for (const segment of preset.segments.sort((a, b) => a.segmentNo - b.segmentNo)) {
    const startMinutes = parseTimeToMinutes(segment.startTime);
    const endMinutes = parseTimeToMinutes(segment.endTime);

    let active = false;
    let shiftDate = today;

    if (!segment.crossesMidnight) {
      active = nowMinutes >= startMinutes && nowMinutes < endMinutes;
      shiftDate = today;
    } else {
      active = nowMinutes >= startMinutes || nowMinutes < endMinutes;
      shiftDate = nowMinutes < endMinutes ? yesterday : today;
    }

    if (!active) {
      continue;
    }

    const startDate = shiftDate;
    const endDate = segment.crossesMidnight && parseTimeToMinutes(segment.endTime) <= startMinutes
      ? today
      : shiftDate;

    return {
      presetId: preset.id,
      presetName: preset.name,
      segmentId: segment.id,
      segmentNo: segment.segmentNo,
      shiftDate,
      startTime: segment.startTime,
      endTime: segment.endTime,
      crossesMidnight: segment.crossesMidnight,
      lateGraceMinutes: segment.lateGraceMinutes,
      scheduleStartLocal: localDateTime(startDate, segment.startTime),
      scheduleEndLocal: localDateTime(endDate, segment.endTime),
      isLateAt: (date: Date, zone: string) => {
        const minutes = minutesNowInZone(date, zone);
        return minutes > startMinutes + segment.lateGraceMinutes;
      }
    };
  }

  return null;
}
