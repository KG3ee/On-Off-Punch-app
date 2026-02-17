export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    throw new Error(`Invalid time value: ${time}`);
  }
  return h * 60 + m;
}

export function getTimePartsInZone(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

export function formatDateInZone(date: Date, timeZone: string): string {
  const p = getTimePartsInZone(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function getPreviousDateInZone(date: Date, timeZone: string): string {
  return formatDateInZone(
    new Date(date.getTime() - 24 * 60 * 60 * 1000),
    timeZone,
  );
}

export function minutesNowInZone(date: Date, timeZone: string): number {
  const p = getTimePartsInZone(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function localDateTime(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}`;
}
