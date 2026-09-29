export type SaleState = "NONE" | "SCHEDULED" | "ACTIVE" | "EXPIRED";

export type AdminVariantSale = {
  productId: string;
  variantId: string;
  sku: string;
  size: string | null;
  color: string | null;
  normalPrice: string;
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  effectivePrice: string;
  isOnSale: boolean;
  state: SaleState;
  productUpdatedAt: string;
};

export type SaleDraft = {
  salePrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
};

export type SaleMutationPayload = {
  expectedUpdatedAt: string;
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
};

export type SaleDraftErrors = Partial<Record<keyof SaleDraft, string>>;
export type SaleEditorMessage = { kind: "success" | "warning" | "error"; text: string };
export type SaleEditorState = {
  sale: AdminVariantSale;
  draft: SaleDraft;
  message: SaleEditorMessage | null;
  conflict: boolean;
};

export type SaleEditorAction =
  | { type: "change"; draft: SaleDraft }
  | { type: "canonical"; sale: AdminVariantSale; message?: string }
  | { type: "conflict"; message: string }
  | { type: "message"; message: SaleEditorMessage | null };

const MONEY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const SAST_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const SAST_OFFSET_MILLISECONDS = 2 * 60 * 60 * 1000;
const ZERO = BigInt(0);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function moneyCents(value: string): bigint | null {
  if (!MONEY.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, "0"));
}

export function formatAdminMoney(value: string): string {
  const cents = moneyCents(value);
  if (cents === null) return "—";
  const whole = (cents / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `R${whole}.${pad(Number(cents % HUNDRED))}`;
}

export function saleStateLabel(state: SaleState): string {
  return state === "NONE" ? "No sale"
    : state === "SCHEDULED" ? "Scheduled"
      : state === "ACTIVE" ? "Active"
        : "Expired";
}

export function isoToSastInput(value: string | null): string {
  if (!value) return "";
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return "";
  const wall = new Date(instant.getTime() + SAST_OFFSET_MILLISECONDS);
  return `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`
    + `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}.${pad(wall.getUTCMilliseconds(), 3)}`;
}

function parseSastInput(value: string): { requestValue: string; instant: number } | null {
  const match = SAST_INPUT.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00", fractionText = ""] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const millisecond = Number(fractionText.padEnd(3, "0"));
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (year < 1
    || wall.getUTCFullYear() !== year
    || wall.getUTCMonth() !== month - 1
    || wall.getUTCDate() !== day
    || wall.getUTCHours() !== hour
    || wall.getUTCMinutes() !== minute
    || wall.getUTCSeconds() !== second
    || wall.getUTCMilliseconds() !== millisecond) return null;
  const normalized = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond, 3)}+02:00`;
  return { requestValue: normalized, instant: wall.getTime() - SAST_OFFSET_MILLISECONDS };
}

export function sastInputToOffset(value: string): string | null {
  if (!value) return null;
  return parseSastInput(value)?.requestValue ?? null;
}

export function saleDraftFromDto(sale: AdminVariantSale): SaleDraft {
  return {
    salePrice: sale.salePrice ?? "",
    saleStartsAt: isoToSastInput(sale.saleStartsAt),
    saleEndsAt: isoToSastInput(sale.saleEndsAt),
  };
}

export function validateSaleDraft(draft: SaleDraft, normalPrice: string): SaleDraftErrors {
  const errors: SaleDraftErrors = {};
  const salePrice = draft.salePrice.trim();
  const saleCents = moneyCents(salePrice);
  const normalCents = moneyCents(normalPrice);
  if (!salePrice) errors.salePrice = "Enter a sale price, or use Remove sale to clear the configuration.";
  else if (saleCents === null || saleCents <= ZERO) errors.salePrice = "Enter a positive amount with no more than two decimal places.";
  else if (normalCents !== null && saleCents >= normalCents) errors.salePrice = "Sale price must be lower than the normal price.";

  const start = draft.saleStartsAt ? parseSastInput(draft.saleStartsAt) : null;
  const end = draft.saleEndsAt ? parseSastInput(draft.saleEndsAt) : null;
  if (draft.saleStartsAt && !start) errors.saleStartsAt = "Enter a valid South Africa date and time.";
  if (draft.saleEndsAt && !end) errors.saleEndsAt = "Enter a valid South Africa date and time.";
  if (start && end && end.instant <= start.instant) errors.saleEndsAt = "End must be later than start.";
  return errors;
}

export function saleMutationPayload(sale: AdminVariantSale, draft: SaleDraft): SaleMutationPayload {
  return {
    expectedUpdatedAt: sale.productUpdatedAt,
    salePrice: draft.salePrice.trim() || null,
    saleStartsAt: draft.saleStartsAt ? sastInputToOffset(draft.saleStartsAt) : null,
    saleEndsAt: draft.saleEndsAt ? sastInputToOffset(draft.saleEndsAt) : null,
  };
}

export function clearSalePayload(sale: AdminVariantSale): SaleMutationPayload {
  return {
    expectedUpdatedAt: sale.productUpdatedAt,
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
  };
}

export function discountPreview(normalPrice: string, salePrice: string): { percent: number; saving: string } | null {
  const normal = moneyCents(normalPrice);
  const sale = moneyCents(salePrice.trim());
  if (normal === null || sale === null || normal <= ZERO || sale <= ZERO || sale >= normal) return null;
  const saving = normal - sale;
  const percent = Number((saving * HUNDRED + normal / TWO) / normal);
  return { percent, saving: formatAdminMoney(`${saving / HUNDRED}.${pad(Number(saving % HUNDRED))}`) };
}

export function createSaleEditorState(sale: AdminVariantSale): SaleEditorState {
  return { sale, draft: saleDraftFromDto(sale), message: null, conflict: false };
}

export function saleEditorReducer(state: SaleEditorState, action: SaleEditorAction): SaleEditorState {
  if (action.type === "change") return { ...state, draft: action.draft, message: null };
  if (action.type === "canonical") return {
    sale: action.sale,
    draft: saleDraftFromDto(action.sale),
    message: action.message ? { kind: "success", text: action.message } : null,
    conflict: false,
  };
  if (action.type === "conflict") return {
    ...state,
    message: { kind: "warning", text: action.message },
    conflict: true,
  };
  return { ...state, message: action.message };
}
