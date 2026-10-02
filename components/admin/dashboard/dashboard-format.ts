import type { ComparisonDirection, CountComparison, MoneyComparison } from "@/lib/admin/dashboard/types";

const EXACT_MONEY = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

type ComparisonView = {
  direction: ComparisonDirection;
  label: string;
  arrow: "↑" | "↓" | null;
  tone: string;
};

function moneyParts(value: string) {
  const match = EXACT_MONEY.exec(value);
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, "");
  return { sign: match[1], whole, fraction: (match[3] ?? "").padEnd(2, "0") };
}

export function formatExactMoney(value: string): string {
  const parts = moneyParts(value);
  if (!parts) return "—";
  const grouped = parts.whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const prefix = parts.sign === "-" ? "-R" : parts.sign === "+" ? "+R" : "R";
  return `${prefix}${grouped}.${parts.fraction}`;
}

export function exactMoneyToCents(value: string): bigint | null {
  const parts = moneyParts(value);
  if (!parts) return null;
  const cents = BigInt(parts.whole) * BigInt(100) + BigInt(parts.fraction);
  return parts.sign === "-" ? -cents : cents;
}

function displayPercentage(value: string | null): string | null {
  return value?.replace(/^[+-]/, "") ?? null;
}

export function comparisonView(comparison: MoneyComparison | CountComparison): ComparisonView {
  const percentage = displayPercentage(comparison.percentage);
  if (comparison.direction === "UP") {
    return { direction: "UP", label: percentage ? `Up ${percentage}%` : "Up", arrow: "↑", tone: "text-emerald-800 bg-emerald-50 ring-emerald-700/15" };
  }
  if (comparison.direction === "DOWN") {
    return { direction: "DOWN", label: percentage ? `Down ${percentage}%` : "Down", arrow: "↓", tone: "text-red-800 bg-red-50 ring-red-700/15" };
  }
  if (comparison.direction === "NEW") {
    return { direction: "NEW", label: "New", arrow: null, tone: "text-emerald-800 bg-emerald-50 ring-emerald-700/15" };
  }
  return { direction: "FLAT", label: "No change", arrow: null, tone: "text-ink/70 bg-paper ring-ink/10" };
}

export function revenueInsight(comparison: MoneyComparison): string {
  const percentage = displayPercentage(comparison.percentage);
  if (comparison.direction === "UP") return `Revenue is up${percentage ? ` ${percentage}%` : ""} versus the same period last month.`;
  if (comparison.direction === "DOWN") return `Revenue is down${percentage ? ` ${percentage}%` : ""} versus the same period last month.`;
  if (comparison.direction === "NEW") return "Revenue is new versus the same period last month.";
  return "Revenue is unchanged versus the same period last month.";
}

export function signedMoneyDelta(comparison: MoneyComparison): string {
  const formatted = formatExactMoney(comparison.absoluteDelta);
  if (formatted === "—") return formatted;
  if (comparison.direction === "UP" || comparison.direction === "NEW") return `+${formatted}`;
  if (comparison.direction === "DOWN") return `-${formatted}`;
  return formatted;
}

export function formatReportingAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Update time unavailable";
  const formatted = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date).replace(/^0/, "");
  return `Updated ${formatted} SAST`;
}

export function formatDashboardDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatTrendMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) return value;
  return new Intl.DateTimeFormat("en-ZA", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(2020, month - 1, 1)));
}
