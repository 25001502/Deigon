import "server-only";

import type {
  OrderEmailDeliveryDestinationV1,
  OrderEmailEventType,
  OrderEmailSnapshotItemV1,
  OrderEmailSnapshotV1,
} from "../order-email-types";

export type RenderedOrderEmail = {
  subject: string;
  html: string;
  text: string;
};

type RenderOrderEmailV1Input = {
  eventType: OrderEmailEventType;
  payload: OrderEmailSnapshotV1;
  appOrigin: string;
};

type Copy = {
  subject: string;
  heading: string;
  message: string;
  detailsHtml: string;
  detailsText: string;
};

const COLORS = {
  sand: "#f2ede4",
  paper: "#fbf7f1",
  ink: "#17231d",
  forest: "#264736",
  clay: "#b65b36",
  brass: "#c9a66b",
} as const;

function renderError(message: string): never {
  const error = new Error(message);
  error.name = "OrderEmailRenderError";
  throw error;
}

export function escapeOrderEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatOrderEmailZar(value: string): string {
  const match = /^(0|[1-9]\d*)\.(\d{2})$/.exec(value);
  if (!match) renderError("Order email money value is invalid.");
  const grouped = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `R ${grouped}.${match[2]}`;
}

function customerOrderUrl(origin: string, orderId: string): string {
  return new URL(`/account/orders/${encodeURIComponent(orderId)}`, origin).toString();
}

function safeImageUrl(value: string | null, origin: string): string | null {
  if (!value) return null;
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      return new URL(value, origin).toString();
    }
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function deliverySummary(destination: OrderEmailDeliveryDestinationV1): string {
  return [
    destination.addressLine1,
    destination.addressLine2,
    destination.city,
    destination.province,
    destination.postalCode,
    destination.country,
  ].filter((part): part is string => Boolean(part)).join(", ");
}

function context(payload: OrderEmailSnapshotV1): { label: string; value: string } {
  return payload.destination.type === "DELIVERY"
    ? { label: "Delivery destination", value: deliverySummary(payload.destination) }
    : { label: "Collection point", value: payload.destination.pickupLocation };
}

function detailHtml(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#59635e;font-size:13px;vertical-align:top;">${escapeOrderEmailHtml(label)}</td><td style="padding:6px 0 6px 18px;color:${COLORS.ink};font-size:14px;font-weight:600;text-align:right;vertical-align:top;">${escapeOrderEmailHtml(value)}</td></tr>`;
}

function itemDescription(item: OrderEmailSnapshotItemV1): string {
  const options = [item.size ? `Size: ${item.size}` : null, item.color ? `Colour: ${item.color}` : null]
    .filter((value): value is string => Boolean(value));
  return options.join(" · ");
}

function confirmationItemsHtml(items: OrderEmailSnapshotItemV1[], origin: string): string {
  return items.map((item) => {
    const image = safeImageUrl(item.imageUrl, origin);
    const imageCell = image
      ? `<td style="padding:14px 12px 14px 0;width:64px;vertical-align:top;"><img src="${escapeOrderEmailHtml(image)}" width="64" height="80" alt="${escapeOrderEmailHtml(item.title)}" style="display:block;width:64px;height:80px;object-fit:cover;border:0;border-radius:2px;" /></td>`
      : "";
    const options = itemDescription(item);
    return `<tr>${imageCell}<td style="padding:14px 8px 14px 0;border-top:1px solid #e2d8c8;vertical-align:top;"><div style="color:${COLORS.ink};font-size:15px;font-weight:700;line-height:1.4;">${escapeOrderEmailHtml(item.title)}</div>${options ? `<div style="padding-top:4px;color:#68716c;font-size:13px;line-height:1.4;">${escapeOrderEmailHtml(options)}</div>` : ""}<div style="padding-top:4px;color:#68716c;font-size:13px;">Quantity: ${item.quantity}</div></td><td style="padding:14px 0;border-top:1px solid #e2d8c8;color:${COLORS.ink};font-size:14px;font-weight:700;text-align:right;vertical-align:top;white-space:nowrap;">${escapeOrderEmailHtml(formatOrderEmailZar(item.lineTotal))}</td></tr>`;
  }).join("");
}

function confirmationItemsText(items: OrderEmailSnapshotItemV1[]): string {
  return items.map((item) => {
    const options = itemDescription(item);
    return `- ${item.title} — Quantity: ${item.quantity}${options ? ` — ${options}` : ""} — ${formatOrderEmailZar(item.lineTotal)}`;
  }).join("\n");
}

function confirmationCopy(payload: OrderEmailSnapshotV1, origin: string): Copy {
  const destination = context(payload);
  const fulfilment = payload.fulfilmentType === "DELIVERY" ? "Delivery" : "Collection";
  return {
    subject: `Order ${payload.orderNumber} confirmed — DEIGON`,
    heading: "Your DEIGON order has been confirmed",
    message: "Thank you for your order. We’ll keep you updated as it moves through each stage.",
    detailsHtml: `<div style="padding-top:12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${confirmationItemsHtml(payload.items, origin)}</table></div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:collapse;">${detailHtml("Fulfilment", fulfilment)}${detailHtml("Subtotal", formatOrderEmailZar(payload.subtotal))}${detailHtml("Shipping", formatOrderEmailZar(payload.shippingFee))}<tr><td style="padding:12px 0 0;border-top:1px solid ${COLORS.brass};color:${COLORS.ink};font-size:15px;font-weight:800;">Total</td><td style="padding:12px 0 0;border-top:1px solid ${COLORS.brass};color:${COLORS.clay};font-size:17px;font-weight:800;text-align:right;">${escapeOrderEmailHtml(formatOrderEmailZar(payload.total))}</td></tr></table><div style="margin-top:22px;padding:16px;background:${COLORS.sand};border-left:3px solid ${COLORS.brass};"><div style="color:#59635e;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeOrderEmailHtml(destination.label)}</div><div style="padding-top:6px;color:${COLORS.ink};font-size:14px;line-height:1.6;">${escapeOrderEmailHtml(destination.value)}</div></div>`,
    detailsText: `Fulfilment: ${fulfilment}\n\nItems\n${confirmationItemsText(payload.items)}\n\nSubtotal: ${formatOrderEmailZar(payload.subtotal)}\nShipping: ${formatOrderEmailZar(payload.shippingFee)}\nTotal: ${formatOrderEmailZar(payload.total)}\n\n${destination.label}: ${destination.value}`,
  };
}

function statusCopy(eventType: OrderEmailEventType, payload: OrderEmailSnapshotV1): Copy {
  const destination = context(payload);
  const details = (extra?: { label: string; value: string }): Pick<Copy, "detailsHtml" | "detailsText"> => {
    const rows = [detailHtml("Order", payload.orderNumber), detailHtml(destination.label, destination.value)];
    const lines = [`Order: ${payload.orderNumber}`, `${destination.label}: ${destination.value}`];
    if (extra) {
      rows.splice(1, 0, detailHtml(extra.label, extra.value));
      lines.splice(1, 0, `${extra.label}: ${extra.value}`);
    }
    return {
      detailsHtml: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">${rows.join("")}</table>`,
      detailsText: lines.join("\n"),
    };
  };

  switch (eventType) {
    case "ORDER_PROCESSING":
      if (!payload.processingAt) renderError("Processing email requires its milestone.");
      return {
        subject: `We’re preparing order ${payload.orderNumber} — DEIGON`,
        heading: "We’re preparing your DEIGON order",
        message: payload.fulfilmentType === "DELIVERY"
          ? "Your pieces are being prepared for delivery. We’ll let you know when they are on the way."
          : "Your pieces are being prepared for collection. We’ll let you know when they are ready.",
        ...details(),
      };
    case "ORDER_SHIPPED":
      if (payload.fulfilmentType !== "DELIVERY" || !payload.shippedAt) {
        renderError("Out-for-delivery email requires a shipped delivery order.");
      }
      return {
        subject: `Order ${payload.orderNumber} is out for delivery — DEIGON`,
        heading: "Your order is out for delivery",
        message: "Your DEIGON order is on its way to your delivery address.",
        ...details(payload.estimatedDeliveryDate
          ? { label: "Estimated delivery", value: payload.estimatedDeliveryDate }
          : undefined),
      };
    case "ORDER_READY_FOR_PICKUP":
      if (payload.fulfilmentType !== "PICKUP" || !payload.readyForPickupAt) {
        renderError("Collection email requires an order ready for pickup.");
      }
      return {
        subject: `Order ${payload.orderNumber} is ready for collection — DEIGON`,
        heading: "Your order is ready for collection",
        message: "Your DEIGON order is ready at the collection point shown below.",
        ...details(),
      };
    case "ORDER_COMPLETED":
      if (!payload.deliveredAt) renderError("Completion email requires its milestone.");
      return payload.fulfilmentType === "DELIVERY"
        ? {
            subject: `Order ${payload.orderNumber} has been delivered — DEIGON`,
            heading: "Your order has been delivered",
            message: "Your DEIGON order has been delivered. Thank you for choosing DEIGON.",
            ...details(),
          }
        : {
            subject: `Order ${payload.orderNumber} has been collected — DEIGON`,
            heading: "Your order has been collected",
            message: "Your DEIGON order has been collected. Thank you for choosing DEIGON.",
            ...details(),
          };
    case "ORDER_CONFIRMED":
      renderError("Confirmation copy must use the itemised template.");
  }
}

function documentHtml(payload: OrderEmailSnapshotV1, copy: Copy, orderUrl: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeOrderEmailHtml(copy.subject)}</title></head><body style="margin:0;padding:0;background:${COLORS.sand};color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:${COLORS.sand};"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border-collapse:collapse;background:${COLORS.paper};border:1px solid #e2d8c8;"><tr><td style="padding:26px 28px;border-bottom:1px solid ${COLORS.brass};color:${COLORS.ink};font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;letter-spacing:.22em;">DEIGON</td></tr><tr><td style="padding:34px 28px 38px;"><div style="color:${COLORS.clay};font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Order ${escapeOrderEmailHtml(payload.orderNumber)}</div><h1 style="margin:10px 0 0;color:${COLORS.ink};font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:600;">${escapeOrderEmailHtml(copy.heading)}</h1><p style="margin:20px 0 0;color:${COLORS.ink};font-size:15px;line-height:1.7;">Hello ${escapeOrderEmailHtml(payload.customer.name)},</p><p style="margin:10px 0 0;color:#4d5852;font-size:15px;line-height:1.7;">${escapeOrderEmailHtml(copy.message)}</p>${copy.detailsHtml}<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;"><tr><td style="border-radius:2px;background:${COLORS.forest};"><a href="${escapeOrderEmailHtml(orderUrl)}" style="display:inline-block;padding:14px 22px;color:${COLORS.paper};font-size:14px;font-weight:700;text-decoration:none;">View your order</a></td></tr></table></td></tr><tr><td style="padding:20px 28px;background:${COLORS.ink};color:#d9d2c7;font-size:12px;line-height:1.6;">DEIGON · South Africa<br>This message contains an update about your order.</td></tr></table></td></tr></table></body></html>`;
}

function documentText(payload: OrderEmailSnapshotV1, copy: Copy, orderUrl: string): string {
  return `DEIGON\n\n${copy.heading}\n\nHello ${payload.customer.name},\n\n${copy.message}\n\n${copy.detailsText}\n\nView your order: ${orderUrl}\n\nDEIGON · South Africa`;
}

export function renderOrderEmailV1(input: RenderOrderEmailV1Input): RenderedOrderEmail {
  if (input.eventType === "ORDER_CONFIRMED" && !input.payload.confirmedAt) {
    renderError("Confirmation email requires its milestone.");
  }
  const copy = input.eventType === "ORDER_CONFIRMED"
    ? confirmationCopy(input.payload, input.appOrigin)
    : statusCopy(input.eventType, input.payload);
  const orderUrl = customerOrderUrl(input.appOrigin, input.payload.orderId);
  return {
    subject: copy.subject,
    html: documentHtml(input.payload, copy, orderUrl),
    text: documentText(input.payload, copy, orderUrl),
  };
}
