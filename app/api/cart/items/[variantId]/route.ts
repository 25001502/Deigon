import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { removeItem, serializeCart, updateItem } from "@/lib/cart/service";

type Params = { params: Promise<{ variantId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { variantId } = await params;
    const body = await request.json().catch(() => { throw new ApiError("Request body must be valid JSON", 400); });
    if (!Number.isInteger(body?.quantity) || body.quantity <= 0) throw new ApiError("quantity must be a positive integer", 400);

    return NextResponse.json({ ok: true, cart: serializeCart(await updateItem(user.id, variantId, body.quantity)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { variantId } = await params;
    return NextResponse.json({ ok: true, cart: serializeCart(await removeItem(user.id, variantId)) });
  } catch (error) {
    return errorResponse(error);
  }
}
