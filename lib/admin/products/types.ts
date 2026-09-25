export type ProductStatusFilter = "ACTIVE" | "INACTIVE";
export type ProductFeaturedFilter = "FEATURED" | "STANDARD";

export type ProductListInput = {
  search: string;
  status?: ProductStatusFilter;
  featured?: ProductFeaturedFilter;
  category?: string;
  limit: number;
  filterKey: string;
  cursor?: { updatedAt: string; id: string };
};

export type ProductImageInput = { url: string; alt: string | null };
export type ProductVariantInput = {
  sku: string;
  size: string | null;
  color: string | null;
  price: string;
};

export type CreateProductInput = {
  name: string;
  slug: string;
  description: string | null;
  badge: string | null;
  details: string[];
  categorySlug: string;
  featured: boolean;
  isActive: boolean;
  images: ProductImageInput[];
  variants: ProductVariantInput[];
};

export type UpdateProductInput = Omit<CreateProductInput, "variants"> & {
  expectedUpdatedAt: string;
};

export type VariantMutationInput = ProductVariantInput & {
  expectedUpdatedAt: string;
};
