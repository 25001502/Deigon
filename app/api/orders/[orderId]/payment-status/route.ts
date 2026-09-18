import { NextResponse, type NextRequest } from "next/server";

import { ApiError, errorResponse } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ orderId: string }> };

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { orderId } = await params;

    if (!ORDER_ID_PATTERN.test(orderId)) {
      throw new ApiError("Order not found", 404);
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfilmentType: true,
        total: true,
        confirmedAt: true,
        payment: {
          select: {
            provider: true,
            status: true,
          },
        },
      },
    });

    if (!order?.payment) {
      throw new ApiError("Order not found", 404);
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfilmentType: order.fulfilmentType,
        total: order.total.toFixed(2),
        confirmedAt: order.confirmedAt,
      },
      payment: order.payment,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
