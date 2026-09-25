export type StockState = "MISSING_INVENTORY" | "OUT_OF_STOCK" | "IN_STOCK";
export type InventoryFilters = {
  search: string;
  category: string;
  status: "" | "ACTIVE" | "INACTIVE";
  stock: "" | StockState;
};

export type InventoryItem = {
  variantId: string;
  product: { name: string; slug: string; isActive: boolean; category: { name: string; slug: string } };
  variant: { sku: string; size: string | null; color: string | null; createdAt?: string; updatedAt?: string };
  inventory: { quantity: number | null; updatedAt: string | null; state: StockState };
  lastManualAdjustmentAt: string | null;
};

export type InventoryAdjustment = {
  id: string;
  quantityBefore: number;
  quantityDelta: number;
  quantityAfter: number;
  reason: "RESTOCK" | "CORRECTION" | "DAMAGE" | "RETURN" | "OTHER";
  note: string | null;
  product: { name: string; slug: string };
  variant: { sku: string; size: string | null; color: string | null };
  administrator: { email: string };
  createdAt: string;
};

export type AdjustmentDraft = {
  delta: string;
  reason: InventoryAdjustment["reason"];
  note: string;
};

export const EMPTY_INVENTORY_FILTERS: InventoryFilters = { search: "", category: "", status: "", stock: "" };
export const EMPTY_ADJUSTMENT: AdjustmentDraft = { delta: "", reason: "RESTOCK", note: "" };

export function buildInventoryQuery(filters: InventoryFilters, cursor: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function adjustmentPayload(
  detail: InventoryItem,
  draft: AdjustmentDraft,
  idempotencyKey: string,
) {
  return {
    idempotencyKey,
    expectedQuantity: detail.inventory.quantity,
    expectedUpdatedAt: detail.inventory.updatedAt,
    delta: Number(draft.delta),
    reason: draft.reason,
    note: draft.note.trim() || null,
  };
}

export function stockStateLabel(state: StockState) {
  if (state === "MISSING_INVENTORY") return "Missing inventory";
  if (state === "OUT_OF_STOCK") return "Out of stock";
  return "In stock";
}

export function reasonLabel(reason: InventoryAdjustment["reason"]) {
  return reason === "RETURN" ? "Return" : reason.charAt(0) + reason.slice(1).toLowerCase();
}

export function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}
