import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ApiError } from "@/lib/api/errors";
import { encodeCursor, listInput, orderId } from "./input";
import { detailSelect, listSelect, serializeDetail, serializeList } from "./serialize";

export async function listAdminOrders(params: URLSearchParams) {
  await requireAdmin();
  const input = listInput(params);
  // Prisma's PostgreSQL contains filter uses LIKE; search text is a literal substring.
  const search = input.search.replace(/[\\%_]/g, "\\$&");
  const filters: Prisma.OrderWhereInput = {
    status: input.status, fulfilmentType: input.fulfilmentType, paymentStatus: input.paymentStatus,
    ...(input.search ? { OR: ["orderNumber", "customerEmail", "customerName"].map((field) => ({
      [field]: { contains: search, mode: "insensitive" },
    })) } : {}),
  };
  const boundary: Prisma.OrderWhereInput = input.cursor ? { OR: [
    { createdAt: { lt: new Date(input.cursor.createdAt) } },
    { createdAt: new Date(input.cursor.createdAt), id: { lt: input.cursor.id } },
  ] } : {};
  const rows = await prisma.order.findMany({
    where: { AND: [filters, boundary] }, select: listSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return { orders: page.map(serializeList), nextCursor: rows.length > input.limit ? encodeCursor(input, page[page.length - 1]) : null };
}

export async function getAdminOrder(id: string) {
  await requireAdmin();
  const row = await prisma.order.findUnique({ where: { id: orderId(id) }, select: detailSelect });
  if (!row) throw new ApiError("Order not found", 404);
  return serializeDetail(row);
}
