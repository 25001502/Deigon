import { formatRand } from "@/lib/money";

export type CurrentPrice = {
  price: number;
  normalPrice: number;
  isOnSale: boolean;
};

export function currentPriceFor(
  product: CurrentPrice,
  selectedVariant?: CurrentPrice,
): CurrentPrice {
  return selectedVariant ?? product;
}

export function ProductPrice({
  pricing,
  className = "",
}: {
  pricing: CurrentPrice;
  className?: string;
}) {
  if (!pricing.isOnSale) {
    return <p className={className}>{formatRand(pricing.price)}</p>;
  }

  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className="text-neutral-500">
        <span className="sr-only">Regular price </span>
        <del>{formatRand(pricing.normalPrice)}</del>
      </span>
      <span className="font-semibold text-neutral-900">
        <span className="sr-only">Sale price </span>
        {formatRand(pricing.price)}
      </span>
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
        Sale
      </span>
    </p>
  );
}
