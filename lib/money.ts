const randFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

export function formatRand(value: number) {
  return randFormatter.format(value);
}