import "server-only";

import { type AdminNewOrderSnapshotV1 } from "../admin-new-order-snapshot";
import { escapeOrderEmailHtml, formatOrderEmailZar, type RenderedOrderEmail } from "./order-email-v1";

export function renderAdminNewOrderV1(
  payload: AdminNewOrderSnapshotV1,
  appOrigin: string,
): RenderedOrderEmail {
  if (!payload.confirmedAt) throw new Error("Admin new-order email requires confirmation.");
  const order = payload;
  const url = new URL(`/admin/orders/${encodeURIComponent(order.orderId)}`, appOrigin).toString();
  const subject = `New paid order ${order.orderNumber} — DEIGON`;
  const fulfilment = order.fulfilmentType === "DELIVERY" ? "Delivery" : "Collection";
  const itemsText = order.items.map((item) => {
    const options = [item.size ? `Size: ${item.size}` : null, item.color ? `Colour: ${item.color}` : null]
      .filter(Boolean).join(" · ");
    return `- ${item.title} × ${item.quantity}${options ? ` — ${options}` : ""}`;
  }).join("\n");
  const itemsHtml = order.items.map((item) => {
    const options = [item.size ? `Size: ${item.size}` : null, item.color ? `Colour: ${item.color}` : null]
      .filter(Boolean).join(" · ");
    return `<li style="padding:6px 0;">${escapeOrderEmailHtml(item.title)} × ${item.quantity}${options ? `<br><span style="color:#555;">${escapeOrderEmailHtml(options)}</span>` : ""}</li>`;
  }).join("");
  const phoneText = payload.customer.phone ? `\nCustomer phone: ${payload.customer.phone}` : "";
  const phoneHtml = payload.customer.phone
    ? `<p style="margin:4px 0;">Phone: ${escapeOrderEmailHtml(payload.customer.phone)}</p>`
    : "";
  return {
    subject,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeOrderEmailHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#f4f4f4;color:#111;font-family:Arial,Helvetica,sans-serif;"><main style="max-width:620px;margin:auto;padding:28px;background:#fff;border:1px solid #ddd;"><div style="font-size:22px;font-weight:700;letter-spacing:.2em;">DEIGON</div><h1 style="font-size:25px;line-height:1.3;">New paid order</h1><p><strong>Order:</strong> ${escapeOrderEmailHtml(order.orderNumber)}</p><p><strong>Total:</strong> ${escapeOrderEmailHtml(formatOrderEmailZar(order.total))}</p><p><strong>Fulfilment:</strong> ${fulfilment}</p><h2 style="font-size:17px;">Items</h2><ul style="padding-left:22px;">${itemsHtml}</ul><h2 style="font-size:17px;">Customer</h2><p style="margin:4px 0;">${escapeOrderEmailHtml(order.customer.name)}</p><p style="margin:4px 0;">${escapeOrderEmailHtml(order.customer.email)}</p>${phoneHtml}<p style="margin-top:28px;"><a href="${escapeOrderEmailHtml(url)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;">View order in admin</a></p></main></body></html>`,
    text: `DEIGON\n\nNew paid order\nOrder: ${order.orderNumber}\nTotal: ${formatOrderEmailZar(order.total)}\nFulfilment: ${fulfilment}\n\nItems\n${itemsText}\n\nCustomer: ${order.customer.name}\nCustomer email: ${order.customer.email}${phoneText}\n\nView order in admin: ${url}`,
  };
}
