import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { parseUpdateProductInput } from "@/lib/api/product-input";
import { serializeProduct } from "@/lib/api/serialize-product";

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

// Admin-only: partial update of product fields, images (full replace), and existing variants' price/stock.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;

    const existing = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
    if (!existing) {
      throw new ApiError("Product not found", 404);
    }

    const body = await request.json().catch(() => {
      throw new ApiError("Request body must be valid JSON", 400);
    });
    const input = parseUpdateProductInput(body);

    let categoryId: string | undefined;
    if (input.categorySlug !== undefined) {
      const category = await prisma.category.findUnique({ where: { slug: input.categorySlug } });
      if (!category) {
        throw new ApiError(`Category "${input.categorySlug}" was not found`, 404);
      }
      categoryId = category.id;
    }

    if (input.slug !== undefined && input.slug !== existing.slug) {
      const slugOwner = await prisma.product.findUnique({ where: { slug: input.slug } });
      if (slugOwner && slugOwner.id !== id) {
        throw new ApiError(`A product with slug "${input.slug}" already exists`, 409);
      }
    }

    if (input.variants) {
      const ownedVariantIds = new Set(existing.variants.map((variant) => variant.id));
      for (const variantUpdate of input.variants) {
        if (!ownedVariantIds.has(variantUpdate.id)) {
          throw new ApiError(`Variant "${variantUpdate.id}" does not belong to this product`, 404);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          featured: input.featured,
          isActive: input.isActive,
          categoryId,
        },
      });

      if (input.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (input.images.length > 0) {
          await tx.productImage.createMany({
            data: input.images.map((image, index) => ({
              productId: id,
              url: image.url,
              alt: image.alt,
              position: index,
            })),
          });
        }
      }

      if (input.variants) {
        for (const variantUpdate of input.variants) {
          if (variantUpdate.price !== undefined) {
            await tx.productVariant.update({ where: { id: variantUpdate.id }, data: { price: variantUpdate.price } });
          }
          if (variantUpdate.quantity !== undefined) {
            // quantity is pre-validated as a non-negative integer in parseUpdateProductInput.
            await tx.inventory.upsert({
              where: { variantId: variantUpdate.id },
              update: { quantity: variantUpdate.quantity },
              create: { variantId: variantUpdate.id, quantity: variantUpdate.quantity },
            });
          }
        }
      }
    });

    const updated = await prisma.product.findUniqueOrThrow({ where: { id }, include: productInclude });
    return NextResponse.json({ ok: true, product: serializeProduct(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}

// Admin-only: soft-delete (deactivate) rather than physically deleting, since existing Cart/Order
// rows reference products/variants and a hard delete would break that history.
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Product not found", 404);
    }

    const deactivated = await prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });

    return NextResponse.json({ ok: true, message: "Product deactivated", product: serializeProduct(deactivated) });
  } catch (error) {
    return errorResponse(error);
  }
}
