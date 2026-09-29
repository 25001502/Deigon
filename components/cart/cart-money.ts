type DisplayCartLine = {
  price: number;
  quantity: number;
};

const CENTS_PER_RAND = 100;

export function displayMoneyToCents(amount: number) {
  const cents = Math.round(amount * CENTS_PER_RAND);

  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) {
    throw new RangeError("Display money must be a finite safe amount");
  }

  return cents;
}

export function displayMoneyFromCents(cents: number) {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("Display cents must be a safe integer");
  }

  return cents / CENTS_PER_RAND;
}

export function calculateDisplayLineTotal(
  price: number,
  quantity: number,
) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError("Display quantity must be a non-negative safe integer");
  }

  const totalCents = displayMoneyToCents(price) * quantity;

  return displayMoneyFromCents(totalCents);
}

export function calculateDisplaySubtotal(items: DisplayCartLine[]) {
  const subtotalCents = items.reduce((total, item) => {
    const lineCents = displayMoneyToCents(item.price) * item.quantity;
    const nextTotal = total + lineCents;

    if (!Number.isSafeInteger(item.quantity) || item.quantity < 0 || !Number.isSafeInteger(nextTotal)) {
      throw new RangeError("Display cart values must use safe integers");
    }

    return nextTotal;
  }, 0);

  return displayMoneyFromCents(subtotalCents);
}

export function displayMoneyMeetsThreshold(
  amount: number,
  threshold: number,
) {
  return displayMoneyToCents(amount) >= displayMoneyToCents(threshold);
}

export function calculateDisplayThresholdCharge(
  amount: number,
  threshold: number,
  charge: number,
) {
  return displayMoneyMeetsThreshold(amount, threshold) ? 0 : charge;
}

export function addDisplayMoney(...amounts: number[]) {
  const totalCents = amounts.reduce(
    (total, amount) => total + displayMoneyToCents(amount),
    0,
  );

  return displayMoneyFromCents(totalCents);
}
