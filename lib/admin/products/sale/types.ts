import type { Prisma } from "@prisma/client";

export type SaleMutationInput = {
  expectedUpdatedAt: string;
  salePrice: Prisma.Decimal | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
};

export type SaleVariantRow = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: Prisma.Decimal;
  salePrice: Prisma.Decimal | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
};
