import { ApiError } from "@/lib/api/errors";

const fields = ["fullName", "addressLine1", "addressLine2", "city", "province", "postalCode", "country", "phone"] as const;

export function parseAddress(body: unknown) {
  if (!body || typeof body !== "object") throw new ApiError("Request body must be an object", 400);
  const value = body as Record<string, unknown>;
  for (const field of fields) {
    if (field !== "addressLine2" && field !== "country" && field !== "phone" && typeof value[field] !== "string") {
      throw new ApiError(`${field} is required`, 400);
    }
    if (value[field] !== undefined && value[field] !== null && typeof value[field] !== "string") {
      throw new ApiError(`${field} must be a string`, 400);
    }
  }
  return {
    fullName: String(value.fullName).trim(),
    addressLine1: String(value.addressLine1).trim(),
    addressLine2: value.addressLine2 ? String(value.addressLine2).trim() : null,
    city: String(value.city).trim(),
    province: String(value.province).trim(),
    postalCode: String(value.postalCode).trim(),
    country: value.country ? String(value.country).trim() : "South Africa",
    phone: value.phone ? String(value.phone).trim() : null,
  };
}
