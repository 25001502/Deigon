export const INVENTORY_PAGE_SIZE = 20;
export const MAX_INVENTORY_PAGE_SIZE = 50;
export const INVENTORY_NOTE_MAX_LENGTH = 500;
export const POSTGRES_INT_MIN = -2_147_483_648;
export const POSTGRES_INT_MAX = 2_147_483_647;

export const INVENTORY_ADJUSTMENT_REASONS = [
  "RESTOCK",
  "CORRECTION",
  "DAMAGE",
  "RETURN",
  "OTHER",
] as const;

export const INVENTORY_STOCK_STATES = [
  "MISSING_INVENTORY",
  "OUT_OF_STOCK",
  "IN_STOCK",
] as const;
