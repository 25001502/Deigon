import "server-only";

import { prisma } from "@/lib/prisma";
import { createYocoCheckout } from "@/lib/payments/yoco";

export class PaymentPreparationError extends Error {
  constructor() {
    super("We couldn't start the payment session. Please try again.");
    this.name = "PaymentPreparationError";
  }
}

export function getPaymentReturnUrls() {
  try {
    // Prefer the server origin, with the existing storefront setting as a fallback.
    // Never derive payment return URLs from request headers or form input.
    const value = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL)?.trim();
    if (!value) throw new PaymentPreparationError();
    const url = new URL(value);
    const localHttp = process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash
    ) {
      throw new PaymentPreparationError();
    }
    return {
      successUrl: new URL("/checkout/payment/success", url.origin).href,
      cancelUrl: new URL("/checkout/payment/cancel", url.origin).href,
      failureUrl: new URL("/checkout/payment/failure", url.origin).href,
    };
  } catch {
    throw new PaymentPreparationError();
  }
}

export type CheckoutPayment = {
  provider: "YOCO";
  redirectUrl: string;
};

/** Invoke only after createOrder has committed and released its database locks. */
export async function prepareOrderPayment(
  userId: string,
  orderId: string,
  returnUrls: ReturnType<typeof getPaymentReturnUrls>,
): Promise<CheckoutPayment> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true, orderNumber: true, total: true, status: true, paymentStatus: true,
        payment: {
          select: { provider: true, status: true, amount: true, transactionId: true },
        },
      },
    });
    if (
      !order || order.status !== "PENDING" || order.paymentStatus !== "PENDING" ||
      !order.payment || order.payment.provider !== "YOCO" ||
      order.payment.status !== "PENDING" || order.payment.transactionId !== null ||
      !order.payment.amount.equals(order.total)
    ) {
      throw new PaymentPreparationError();
    }

    const checkout = await createYocoCheckout({
      amount: order.total,
      idempotencyKey: `deigon-yoco-${order.id}`,
      externalId: order.id,
      metadata: { orderNumber: order.orderNumber },
      ...returnUrls,
    });

    // Atomic compare-and-set: concurrent retries may agree, but never replace another ID.
    const saved = await prisma.payment.updateMany({
      where: {
        orderId: order.id,
        provider: "YOCO",
        status: "PENDING",
        transactionId: null,
        order: { userId, status: "PENDING", paymentStatus: "PENDING" },
        OR: [{ providerCheckoutId: null }, { providerCheckoutId: checkout.checkoutId }],
      },
      data: { providerCheckoutId: checkout.checkoutId },
    });
    if (saved.count !== 1) throw new PaymentPreparationError();

    return { provider: "YOCO", redirectUrl: checkout.redirectUrl };
  } catch {
    // Neither provider errors nor database details belong in the API response or logs.
    throw new PaymentPreparationError();
  }
}
