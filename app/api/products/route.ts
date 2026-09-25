import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { serializeProduct } from "@/lib/api/serialize-product";
import { POST as adminPost } from "@/app/api/admin/products/route";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const productInclude = {
  category: true,
  images: true,
  variants: { include: { inventory: true } },
} satisfies Prisma.ProductInclude;

// Public: lists active products with pagination, name search, and category filtering.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
    );
    const search = searchParams.get("q")?.trim();
    const categorySlug = searchParams.get("category")?.trim();

    const where: Prisma.ProductWhereInput = { isActive: true };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (categorySlug) {
      where.category = { slug: categorySlug };
    }

    const [total, products] = await prisma.$transaction(
      [
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: productInclude,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ],
      // See lib/cart/service.ts cartTransactionOptions for why this pooler needs a longer timeout
      // than Prisma's 5000ms default.
      { timeout: 15000 },
    );

    return NextResponse.json({
      ok: true,
      products: products.map(serializeProduct),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Legacy admin entry point: delegates to the strict Admin D catalogue handler.
export async function POST(request: NextRequest) {
  return adminPost(request);
}
