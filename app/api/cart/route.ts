import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/api/errors";
import { clearCart, getCart, serializeCart } from "@/lib/cart/service";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ ok: true, cart: serializeCart(await getCart(user.id)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const user = await requireUser();
    return NextResponse.json({ ok: true, cart: serializeCart(await clearCart(user.id)) });
  } catch (error) {
    return errorResponse(error);
  }
}
