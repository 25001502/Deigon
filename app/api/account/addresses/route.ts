import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

const fields = ["fullName", "addressLine1", "addressLine2", "city", "province", "postalCode", "country", "phone"] as const;

function parseAddress(body: unknown) {
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

export async function GET() {
  try {
    const user = await requireUser();
    const addresses = await prisma.address.findMany({ where: { userId: user.id }, orderBy: { id: "desc" } });
    return NextResponse.json({ ok: true, addresses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const address = await prisma.address.create({ data: { userId: user.id, ...parseAddress(await request.json()) } });
    return NextResponse.json({ ok: true, address }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export { parseAddress };
