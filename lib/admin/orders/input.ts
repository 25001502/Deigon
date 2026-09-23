import "server-only";
import { createHash } from "node:crypto";
import { FulfilmentType, OrderStatus, PaymentStatus } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import type { EstimateInput, FulfilmentInput, OrderListInput } from "./types";

function invalid(): never { throw new ApiError("Invalid order request", 400); }

function enumValue<T extends string>(value: unknown, values: Record<string, T>): T {
  if (typeof value !== "string" || !Object.values(values).includes(value as T)) invalid();
  return value as T;
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) invalid();
  return result;
}

export function orderId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,128}$/.test(value)) invalid();
  return value;
}

export function calendarDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) invalid();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid();
  return value;
}

export function johannesburgToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function fulfilmentInput(value: unknown): FulfilmentInput {
  const body = object(value, ["expectedStatus", "targetStatus"]);
  return { expectedStatus: enumValue(body.expectedStatus, OrderStatus), targetStatus: enumValue(body.targetStatus, OrderStatus) };
}

export function estimateInput(value: unknown): EstimateInput {
  const body = object(value, ["expectedStatus", "expectedEstimatedDeliveryDate", "estimatedDeliveryDate"]);
  return {
    expectedStatus: enumValue(body.expectedStatus, OrderStatus),
    expectedEstimatedDeliveryDate: calendarDate(body.expectedEstimatedDeliveryDate),
    estimatedDeliveryDate: calendarDate(body.estimatedDeliveryDate),
  };
}

export function listInput(params: URLSearchParams): OrderListInput {
  const keys = ["search", "status", "fulfilmentType", "paymentStatus", "limit", "cursor"];
  for (const key of params.keys()) {
    if (!keys.includes(key) || params.getAll(key).length !== 1) invalid();
  }
  const search = (params.get("search") ?? "").trim();
  if (search.length > 200) invalid();
  const status = params.has("status") ? enumValue(params.get("status"), OrderStatus) : undefined;
  const fulfilmentType = params.has("fulfilmentType") ? enumValue(params.get("fulfilmentType"), FulfilmentType) : undefined;
  const paymentStatus = params.has("paymentStatus") ? enumValue(params.get("paymentStatus"), PaymentStatus) : undefined;
  const rawLimit = params.get("limit") ?? "25";
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50) invalid();
  const filterKey = createHash("sha256").update(JSON.stringify([search.toLowerCase(), status, fulfilmentType, paymentStatus])).digest("hex");
  const result: OrderListInput = { search, status, fulfilmentType, paymentStatus, limit: Number(rawLimit), filterKey };
  if (params.has("cursor")) {
    const encoded = params.get("cursor")!;
    if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid();
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { invalid(); }
    const cursor = object(decoded, ["v", "filterKey", "createdAt", "id"]);
    if (cursor.v !== 1 || cursor.filterKey !== filterKey || typeof cursor.createdAt !== "string") invalid();
    const date = new Date(cursor.createdAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== cursor.createdAt) invalid();
    result.cursor = { createdAt: cursor.createdAt, id: orderId(cursor.id) };
  }
  return result;
}

export function encodeCursor(input: OrderListInput, row: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({ v: 1, filterKey: input.filterKey, createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}
