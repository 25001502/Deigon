import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/api/errors";
import { clearCart, getCart, serializeCart } from "@/lib/cart/service";

export async function GET() {
  try {
    const user = await requireUser();
    const cart = await getCart(user.id);
    const pricingAt = new Date();
    return NextResponse.json(
      { ok: true, cart: serializeCart(cart, pricingAt) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const user = await requireUser();
    const cart = await clearCart(user.id);
    const pricingAt = new Date();
    return NextResponse.json(
      { ok: true, cart: serializeCart(cart, pricingAt) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
