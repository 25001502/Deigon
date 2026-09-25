import type {
  INVENTORY_ADJUSTMENT_REASONS,
  INVENTORY_STOCK_STATES,
} from "./config";

export type InventoryAdjustmentReasonInput = typeof INVENTORY_ADJUSTMENT_REASONS[number];
export type InventoryStockState = typeof INVENTORY_STOCK_STATES[number];
export type InventoryProductStatus = "ACTIVE" | "INACTIVE";

export type InventoryListInput = {
  search: string;
  category?: string;
  status?: InventoryProductStatus;
  stock?: InventoryStockState;
  limit: number;
  filterKey: string;
  cursor?: { updatedAt: string; id: string };
};

export type AdjustmentHistoryInput = {
  limit: number;
  cursor?: { createdAt: string; id: string };
};

export type InventoryAdjustmentInput = {
  idempotencyKey: string;
  expectedQuantity: number;
  expectedUpdatedAt: string;
  delta: number;
  reason: InventoryAdjustmentReasonInput;
  note: string | null;
};
