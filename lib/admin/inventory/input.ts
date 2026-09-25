import "server-only";

import { createHash } from "node:crypto";

import { ApiError } from "@/lib/api/errors";

import {
  INVENTORY_ADJUSTMENT_REASONS,
  INVENTORY_NOTE_MAX_LENGTH,
  INVENTORY_PAGE_SIZE,
  INVENTORY_STOCK_STATES,
  MAX_INVENTORY_PAGE_SIZE,
  POSTGRES_INT_MAX,
  POSTGRES_INT_MIN,
} from "./config";
import type {
  AdjustmentHistoryInput,
  InventoryAdjustmentInput,
  InventoryListInput,
  InventoryProductStatus,
  InventoryStockState,
} from "./types";

function invalid(message = "Invalid inventory request"): never {
  throw new ApiError(message, 400);
}

function object(value: unknown, keys: string[], message = "Invalid inventory request"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) invalid(message);
  return result;
}

export function variantId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,128}$/.test(value)) invalid();
  return value;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string") invalid(`${field} must be an ISO timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalid(`${field} must be an ISO timestamp`);
  return value;
}

function pageLimit(value: string | null): number {
  const raw = value ?? String(INVENTORY_PAGE_SIZE);
  if (!/^[1-9]\d?$/.test(raw) || Number(raw) > MAX_INVENTORY_PAGE_SIZE) invalid("Invalid inventory list query");
  return Number(raw);
}

function slug(value: unknown): string {
  if (typeof value !== "string" || value.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    invalid("Invalid inventory list query");
  }
  return value;
}

function cursorObject(encoded: string, fields: string[]) {
  if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid("Invalid inventory list query");
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { invalid("Invalid inventory list query"); }
  return object(decoded, fields, "Invalid inventory list query");
}

export function inventoryListInput(params: URLSearchParams): InventoryListInput {
  const allowed = ["search", "category", "status", "stock", "limit", "cursor"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid("Invalid inventory list query");
  }
  const search = (params.get("search") ?? "").trim();
  if (search.length > 160) invalid("Invalid inventory list query");
  const rawStatus = params.get("status");
  const status = rawStatus === null || rawStatus === "" ? undefined : rawStatus as InventoryProductStatus;
  if (status && !["ACTIVE", "INACTIVE"].includes(status)) invalid("Invalid inventory list query");
  const rawStock = params.get("stock");
  const stock = rawStock === null || rawStock === "" ? undefined : rawStock as InventoryStockState;
  if (stock && !INVENTORY_STOCK_STATES.includes(stock)) invalid("Invalid inventory list query");
  const category = params.has("category") && params.get("category") !== "" ? slug(params.get("category")) : undefined;
  const limit = pageLimit(params.get("limit"));
  const filterKey = createHash("sha256")
    .update(JSON.stringify([search.toLocaleLowerCase(), category, status, stock]))
    .digest("hex");
  const result: InventoryListInput = { search, category, status, stock, limit, filterKey };
  if (params.has("cursor")) {
    const cursor = cursorObject(params.get("cursor")!, ["v", "filterKey", "updatedAt", "id"]);
    if (cursor.v !== 1 || cursor.filterKey !== filterKey || typeof cursor.updatedAt !== "string") invalid("Invalid inventory list query");
    result.cursor = { updatedAt: timestamp(cursor.updatedAt, "cursor"), id: variantId(cursor.id) };
  }
  return result;
}

export function encodeInventoryCursor(input: InventoryListInput, row: { id: string; updatedAt: Date }): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    filterKey: input.filterKey,
    updatedAt: row.updatedAt.toISOString(),
    id: row.id,
  })).toString("base64url");
}

export function adjustmentHistoryInput(params: URLSearchParams): AdjustmentHistoryInput {
  for (const key of params.keys()) {
    if (!["limit", "cursor"].includes(key) || params.getAll(key).length !== 1) invalid("Invalid adjustment history query");
  }
  const result: AdjustmentHistoryInput = { limit: pageLimit(params.get("limit")) };
  if (params.has("cursor")) {
    const cursor = cursorObject(params.get("cursor")!, ["v", "createdAt", "id"]);
    if (cursor.v !== 1 || typeof cursor.createdAt !== "string") invalid("Invalid adjustment history query");
    result.cursor = { createdAt: timestamp(cursor.createdAt, "cursor"), id: variantId(cursor.id) };
  }
  return result;
}

export function encodeAdjustmentCursor(row: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

export function inventoryAdjustmentInput(value: unknown): InventoryAdjustmentInput {
  const data = object(value, ["idempotencyKey", "expectedQuantity", "expectedUpdatedAt", "delta", "reason", "note"]);
  if (typeof data.idempotencyKey !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.idempotencyKey)) {
    invalid("idempotencyKey must be a UUID");
  }
  if (!Number.isInteger(data.expectedQuantity) || Number(data.expectedQuantity) < 0 || Number(data.expectedQuantity) > POSTGRES_INT_MAX) {
    invalid("expectedQuantity must be a non-negative PostgreSQL integer");
  }
  if (!Number.isInteger(data.delta) || Number(data.delta) === 0
    || Number(data.delta) < POSTGRES_INT_MIN || Number(data.delta) > POSTGRES_INT_MAX) {
    invalid("delta must be a non-zero PostgreSQL integer");
  }
  if (typeof data.reason !== "string" || !INVENTORY_ADJUSTMENT_REASONS.includes(data.reason as never)) {
    invalid("Invalid inventory adjustment reason");
  }
  if (data.note !== null && typeof data.note !== "string") invalid("note must be a string or null");
  const note = typeof data.note === "string" ? data.note.trim() : null;
  if (note && note.length > INVENTORY_NOTE_MAX_LENGTH) invalid(`note must be at most ${INVENTORY_NOTE_MAX_LENGTH} characters`);
  return {
    idempotencyKey: data.idempotencyKey.toLowerCase(),
    expectedQuantity: Number(data.expectedQuantity),
    expectedUpdatedAt: timestamp(data.expectedUpdatedAt, "expectedUpdatedAt"),
    delta: Number(data.delta),
    reason: data.reason as InventoryAdjustmentInput["reason"],
    note: note || null,
  };
}
