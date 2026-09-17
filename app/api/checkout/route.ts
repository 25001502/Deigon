import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { ApiError, errorResponse } from "@/lib/api/errors";
import {
  createOrder,
  type CreateOrderInput,
} from "@/lib/checkout/service";
import {
  getPaymentReturnUrls,
  PaymentPreparationError,
  prepareOrderPayment,
} from "@/lib/payments/prepare-order-payment";

function parseCheckoutBody(body: unknown): CreateOrderInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("Request body must be an object", 400);
  }

  return body as CreateOrderInput;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json().catch(() => {
      throw new ApiError("Request body must be valid JSON", 400);
    });

    const input = parseCheckoutBody(body);
    const returnUrls = getPaymentReturnUrls();

    const order = await createOrder(user.id, input);
    const payment = await prepareOrderPayment(user.id, order.id, returnUrls);

    return NextResponse.json(
      {
        ok: true,
        order,
        payment,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (error instanceof PaymentPreparationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }
    return errorResponse(error);
  }
}
