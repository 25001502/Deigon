import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { addItem, serializeCart } from "@/lib/cart/service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => { throw new ApiError("Request body must be valid JSON", 400); });
    if (typeof body?.variantId !== "string" || !body.variantId) throw new ApiError("variantId is required", 400);
    if (!Number.isInteger(body.quantity) || body.quantity <= 0) throw new ApiError("quantity must be a positive integer", 400);

    const cart = await addItem(user.id, { variantId: body.variantId, quantity: body.quantity });
    return NextResponse.json({ ok: true, cart: serializeCart(cart) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
