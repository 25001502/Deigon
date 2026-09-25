import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { serializeProduct } from "@/lib/api/serialize-product";
import { DELETE as adminDelete, PATCH as adminPatch } from "@/app/api/admin/products/[productId]/route";

// Next.js requires one dynamic segment name per route position, so GET (spec: /api/products/[slug])
// and PATCH/DELETE (spec: /api/products/[id]) share this single [id] folder. GET treats the segment
// as the product's slug; PATCH/DELETE treat it as the product's id, matching the task's two contracts.
type RouteParams = { params: Promise<{ id: string }> };

const productInclude = {
  category: true,
  images: true,
  variants: { include: { inventory: true } },
} satisfies Prisma.ProductInclude;

// Public: fetch one active product by slug (GET /api/products/[slug]).
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id: slug } = await params;

    const product = await prisma.product.findFirst({
      where: { slug, isActive: true },
      include: productInclude,
    });

    if (!product) {
      return NextResponse.json({ ok: false, message: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, product: serializeProduct(product) });
  } catch (error) {
    return errorResponse(error);
  }
}

// Legacy admin entry point: delegates to the strict Admin D catalogue handler.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return adminPatch(request, { params: Promise.resolve({ productId: id }) });
}

// Legacy admin entry point: delegates to the Admin D archive handler.
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return adminDelete(request, { params: Promise.resolve({ productId: id }) });
}
