import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/errors";
import { getCustomerOrderForCurrentUser } from "@/lib/account/orders/query";

type Params = { params: Promise<{ orderId: string }> };

function preventCaching(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { orderId } = await params;
    const order = await getCustomerOrderForCurrentUser(orderId);
    return preventCaching(NextResponse.json({ ok: true, data: order }));
  } catch (error) {
    return preventCaching(errorResponse(error));
  }
}
