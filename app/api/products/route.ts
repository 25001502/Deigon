import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { parseCreateProductInput } from "@/lib/api/product-input";
import { serializeProduct } from "@/lib/api/serialize-product";

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

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      products: products.map(serializeProduct),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Admin-only: creates a product with its images and at least one purchasable variant + inventory row.
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => {
      throw new ApiError("Request body must be valid JSON", 400);
    });
    const input = parseCreateProductInput(body);

    const category = await prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new ApiError(`Category "${input.categorySlug}" was not found`, 404);
    }

    const existingSlug = await prisma.product.findUnique({ where: { slug: input.slug } });
    if (existingSlug) {
      throw new ApiError(`A product with slug "${input.slug}" already exists`, 409);
    }

    const skus = input.variants.map((variant) => variant.sku);
    const conflictingVariant = await prisma.productVariant.findFirst({ where: { sku: { in: skus } } });
    if (conflictingVariant) {
      throw new ApiError(`SKU "${conflictingVariant.sku}" is already in use`, 409);
    }

    const productId = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          featured: input.featured,
          isActive: input.isActive,
          categoryId: category.id,
        },
      });

      if (input.images.length > 0) {
        await tx.productImage.createMany({
          data: input.images.map((image, index) => ({
            productId: product.id,
            url: image.url,
            alt: image.alt,
            position: index,
          })),
        });
      }

      for (const variant of input.variants) {
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: variant.sku,
            size: variant.size,
            color: variant.color,
            price: variant.price,
          },
        });

        await tx.inventory.create({
          data: { variantId: createdVariant.id, quantity: variant.quantity },
        });
      }

      return product.id;
    });

    const created = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: productInclude,
    });

    return NextResponse.json({ ok: true, product: serializeProduct(created) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
