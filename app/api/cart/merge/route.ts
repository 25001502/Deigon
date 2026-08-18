import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { mergeItems, serializeCart } from "@/lib/cart/service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => { throw new ApiError("Request body must be valid JSON", 400); });
    if (!Array.isArray(body?.items)) throw new ApiError("items must be an array", 400);

    const result = await mergeItems(user.id, body.items);
    return NextResponse.json({ ok: true, cart: serializeCart(result.cart), results: result.results });
  } catch (error) {
    return errorResponse(error);
  }
}
