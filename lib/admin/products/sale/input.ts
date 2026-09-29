import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";

import type { SaleMutationInput } from "./types";

function invalid(message = "Invalid sale pricing request"): never {
  throw new ApiError(message, 400);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  const keys = ["expectedUpdatedAt", "salePrice", "saleStartsAt", "saleEndsAt"];
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) invalid();
  return result;
}

function expectedUpdatedAt(value: unknown): string {
  if (typeof value !== "string") invalid("expectedUpdatedAt must be an ISO timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    invalid("expectedUpdatedAt must be an ISO timestamp");
  }
  return value;
}

function money(value: unknown): Prisma.Decimal | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    invalid("salePrice must be a positive amount with no more than two decimal places");
  }
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || !amount.gt(0) || amount.gt("99999999.99")) {
    invalid("salePrice must be a positive amount with no more than two decimal places");
  }
  return amount;
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return leapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function instant(value: unknown, field: "saleStartsAt" | "saleEndsAt"): Date | null {
  if (value === null) return null;
  if (typeof value !== "string") invalid(`${field} must be an absolute ISO timestamp or null`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) invalid(`${field} must be an absolute ISO timestamp with at most millisecond precision`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
    || hour > 23 || minute > 59 || second > 59) {
    invalid(`${field} must be a valid calendar instant`);
  }
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      invalid(`${field} has an invalid timezone offset`);
    }
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`${field} must be a valid calendar instant`);
  return date;
}

export function saleMutationInput(value: unknown): SaleMutationInput {
  const data = object(value);
  const salePrice = money(data.salePrice);
  const saleStartsAt = instant(data.saleStartsAt, "saleStartsAt");
  const saleEndsAt = instant(data.saleEndsAt, "saleEndsAt");
  if (salePrice === null && (saleStartsAt !== null || saleEndsAt !== null)) {
    invalid("Sale schedule timestamps require a sale price");
  }
  if (saleStartsAt && saleEndsAt && saleEndsAt.getTime() <= saleStartsAt.getTime()) {
    invalid("saleEndsAt must be later than saleStartsAt");
  }
  return {
    expectedUpdatedAt: expectedUpdatedAt(data.expectedUpdatedAt),
    salePrice,
    saleStartsAt,
    saleEndsAt,
  };
}
