import { ApiError } from "@/lib/api/errors";

export type ProductImageInput = { url: string; alt: string | null };
export type ProductVariantInput = {
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  quantity: number;
};
export type UpdateVariantInput = { id: string; price?: number; quantity?: number };

export type CreateProductInput = {
  slug: string;
  name: string;
  description: string | null;
  categorySlug: string;
  featured: boolean;
  isActive: boolean;
  images: ProductImageInput[];
  variants: ProductVariantInput[];
};

export type UpdateProductInput = {
  slug?: string;
  name?: string;
  description?: string | null;
  categorySlug?: string;
  featured?: boolean;
  isActive?: boolean;
  images?: ProductImageInput[];
  variants?: UpdateVariantInput[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseImages(value: unknown): ProductImageInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ApiError("images must be an array", 400);

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new ApiError(`images[${index}] must be an object`, 400);
    }
    const image = entry as Record<string, unknown>;
    if (!isNonEmptyString(image.url)) {
      throw new ApiError(`images[${index}].url is required`, 400);
    }
    return { url: image.url.trim(), alt: typeof image.alt === "string" ? image.alt : null };
  });
}

function parseCreateVariants(value: unknown): ProductVariantInput[] {
  if (value === undefined || !Array.isArray(value)) {
    throw new ApiError("variants must be a non-empty array", 400);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new ApiError(`variants[${index}] must be an object`, 400);
    }
    const variant = entry as Record<string, unknown>;

    if (!isNonEmptyString(variant.sku)) {
      throw new ApiError(`variants[${index}].sku is required`, 400);
    }
    if (!isFiniteNumber(variant.price) || variant.price <= 0) {
      throw new ApiError(`variants[${index}].price must be a positive number`, 400);
    }
    if (variant.quantity !== undefined && !isNonNegativeInt(variant.quantity)) {
      throw new ApiError(`variants[${index}].quantity must be a non-negative integer`, 400);
    }

    return {
      sku: variant.sku.trim(),
      size: typeof variant.size === "string" ? variant.size : null,
      color: typeof variant.color === "string" ? variant.color : null,
      price: variant.price,
      // Real admin-created stock defaults to 0 (not in stock) until explicitly set, unlike the dev seed.
      quantity: typeof variant.quantity === "number" ? variant.quantity : 0,
    };
  });
}

export function parseCreateProductInput(body: unknown): CreateProductInput {
  if (typeof body !== "object" || body === null) {
    throw new ApiError("Request body must be a JSON object", 400);
  }
  const data = body as Record<string, unknown>;

  if (!isNonEmptyString(data.slug)) throw new ApiError("slug is required", 400);
  if (!isNonEmptyString(data.name)) throw new ApiError("name is required", 400);
  if (!isNonEmptyString(data.categorySlug)) throw new ApiError("categorySlug is required", 400);
  if (data.description !== undefined && data.description !== null && typeof data.description !== "string") {
    throw new ApiError("description must be a string", 400);
  }
  if (data.featured !== undefined && typeof data.featured !== "boolean") {
    throw new ApiError("featured must be a boolean", 400);
  }
  if (data.isActive !== undefined && typeof data.isActive !== "boolean") {
    throw new ApiError("isActive must be a boolean", 400);
  }

  const variants = parseCreateVariants(data.variants);
  if (variants.length === 0) {
    throw new ApiError("At least one variant is required", 400);
  }

  return {
    slug: data.slug.trim(),
    name: data.name.trim(),
    description: typeof data.description === "string" ? data.description : null,
    categorySlug: data.categorySlug.trim(),
    featured: data.featured === true,
    isActive: data.isActive !== false,
    images: parseImages(data.images),
    variants,
  };
}

export function parseUpdateProductInput(body: unknown): UpdateProductInput {
  if (typeof body !== "object" || body === null) {
    throw new ApiError("Request body must be a JSON object", 400);
  }
  const data = body as Record<string, unknown>;
  const result: UpdateProductInput = {};

  if (data.slug !== undefined) {
    if (!isNonEmptyString(data.slug)) throw new ApiError("slug must be a non-empty string", 400);
    result.slug = data.slug.trim();
  }
  if (data.name !== undefined) {
    if (!isNonEmptyString(data.name)) throw new ApiError("name must be a non-empty string", 400);
    result.name = data.name.trim();
  }
  if (data.description !== undefined) {
    if (data.description !== null && typeof data.description !== "string") {
      throw new ApiError("description must be a string or null", 400);
    }
    result.description = data.description as string | null;
  }
  if (data.categorySlug !== undefined) {
    if (!isNonEmptyString(data.categorySlug)) throw new ApiError("categorySlug must be a non-empty string", 400);
    result.categorySlug = data.categorySlug.trim();
  }
  if (data.featured !== undefined) {
    if (typeof data.featured !== "boolean") throw new ApiError("featured must be a boolean", 400);
    result.featured = data.featured;
  }
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== "boolean") throw new ApiError("isActive must be a boolean", 400);
    result.isActive = data.isActive;
  }
  if (data.images !== undefined) {
    result.images = parseImages(data.images);
  }
  if (data.variants !== undefined) {
    if (!Array.isArray(data.variants)) throw new ApiError("variants must be an array", 400);
    result.variants = data.variants.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new ApiError(`variants[${index}] must be an object`, 400);
      }
      const variant = entry as Record<string, unknown>;
      if (!isNonEmptyString(variant.id)) {
        throw new ApiError(`variants[${index}].id is required`, 400);
      }
      if (variant.price !== undefined && (!isFiniteNumber(variant.price) || variant.price <= 0)) {
        throw new ApiError(`variants[${index}].price must be a positive number`, 400);
      }
      if (variant.quantity !== undefined && !isNonNegativeInt(variant.quantity)) {
        throw new ApiError(`variants[${index}].quantity must be a non-negative integer`, 400);
      }
      return {
        id: variant.id.trim(),
        price: typeof variant.price === "number" ? variant.price : undefined,
        quantity: typeof variant.quantity === "number" ? variant.quantity : undefined,
      };
    });
  }

  return result;
}
