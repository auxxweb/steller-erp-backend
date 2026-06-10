/**
 * Compute rental duration in whole days (minimum 1).
 */
export const computeDurationDays = (startAt, endAt) => {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const ms = end.getTime() - start.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
};

/**
 * Pick unit rate from product/combo pricing by rate type.
 */
export const resolveUnitRate = (pricing = {}, rateType = 'daily') => {
  if (!pricing) return 0;
  // Backward compat: older products stored rates at root
  const p =
    pricing.individual || pricing.combo
      ? pricing.individual || pricing.combo
      : pricing;
  switch (rateType) {
    case 'weekly':
      return p.weeklyRate ?? (p.dailyRate ? p.dailyRate * 7 : 0);
    case 'monthly':
      return p.monthlyRate ?? (p.dailyRate ? p.dailyRate * 30 : 0);
    case 'flat':
      return p.dailyRate ?? 0;
    case 'daily':
    default:
      return p.dailyRate ?? 0;
  }
};

/**
 * Line totals for one rental item.
 */
export const computeLineAmounts = ({
  unitRate,
  quantity = 1,
  durationDays = 1,
  rateType = 'daily',
  lineDiscount = 0,
  taxRate = 0,
}) => {
  const qty = Math.max(1, quantity);
  const days = Math.max(1, durationDays);
  let lineSubtotal = unitRate * qty;

  if (rateType === 'daily') {
    lineSubtotal = unitRate * qty * days;
  } else if (rateType === 'weekly') {
    lineSubtotal = unitRate * qty * Math.ceil(days / 7);
  } else if (rateType === 'monthly') {
    lineSubtotal = unitRate * qty * Math.ceil(days / 30);
  }

  const discount = Math.min(lineSubtotal, Math.max(0, lineDiscount));
  const afterDiscount = lineSubtotal - discount;
  const lineTax = Math.round((afterDiscount * taxRate) / 100);
  const lineTotal = afterDiscount + lineTax;

  return {
    lineSubtotal,
    lineDiscount: discount,
    lineTax,
    lineTotal,
  };
};

/**
 * Aggregate rental header amounts from line items.
 */
export const aggregateRentalAmounts = (lines, { taxRate = 0, deposit = 0 } = {}) => {
  const subtotal = lines.reduce((s, l) => s + (l.lineSubtotal || 0), 0);
  const discount = lines.reduce((s, l) => s + (l.lineDiscount || 0), 0);
  const tax = lines.reduce((s, l) => s + (l.lineTax || 0), 0);
  const total = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);

  return {
    subtotal,
    discount,
    tax,
    total,
    deposit: deposit || 0,
    lateFee: 0,
    damageFee: 0,
    amountPaid: 0,
    balanceDue: total + (deposit || 0),
  };
};
