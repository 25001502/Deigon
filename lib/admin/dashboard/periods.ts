const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

export type ReportingPeriod = { start: Date; end: Date };
export type DashboardPeriods = {
  current: ReportingPeriod;
  previousComparable: ReportingPeriod;
  trendStart: Date;
  trendMonths: string[];
};

function sastInstant(year: number, monthIndex: number, day: number, hours = 0, minutes = 0, seconds = 0, milliseconds = 0) {
  const local = new Date(0);
  local.setUTCFullYear(year, monthIndex, day);
  local.setUTCHours(hours, minutes, seconds, milliseconds);
  return new Date(local.getTime() - SAST_OFFSET_MS);
}

function daysInMonth(year: number, monthIndex: number) {
  const last = new Date(0);
  last.setUTCFullYear(year, monthIndex + 1, 0);
  return last.getUTCDate();
}

/** Every boundary is a UTC instant derived from the same SAST reporting instant. */
export function dashboardPeriods(reportingAt: Date): DashboardPeriods {
  if (!Number.isFinite(reportingAt.getTime())) throw new RangeError("Invalid reporting timestamp");
  const local = new Date(reportingAt.getTime() + SAST_OFFSET_MS);
  const year = local.getUTCFullYear();
  const monthIndex = local.getUTCMonth();
  const currentStart = sastInstant(year, monthIndex, 1);
  const previousStart = sastInstant(year, monthIndex - 1, 1);
  const previousLocal = new Date(previousStart.getTime() + SAST_OFFSET_MS);
  const previousYear = previousLocal.getUTCFullYear();
  const previousMonthIndex = previousLocal.getUTCMonth();
  const day = local.getUTCDate();
  const previousEnd = day > daysInMonth(previousYear, previousMonthIndex)
    ? currentStart
    : sastInstant(previousYear, previousMonthIndex, day,
      local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());

  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const first = new Date(sastInstant(year, monthIndex - 5 + index, 1).getTime() + SAST_OFFSET_MS);
    return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  return {
    current: { start: currentStart, end: reportingAt },
    previousComparable: { start: previousStart, end: previousEnd },
    trendStart: sastInstant(year, monthIndex - 5, 1),
    trendMonths,
  };
}

/** Prisma writes DateTime @db.Timestamp(3) as a UTC wall-clock timestamp. */
export function storedUtcTimestamp(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) throw new RangeError("Invalid reporting timestamp");
  return instant.toISOString().slice(0, -1);
}
