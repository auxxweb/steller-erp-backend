/**
 * Recompute invoice totals from line items and adjustments.
 */
export const recalculateInvoiceAmounts = ({
  lineItems = [],
  discount = 0,
  lateFee = 0,
  damageFee = 0,
  gstEnabled = true,
  gstRate = 18,
  advanceAmount = 0,
  amountPaid = 0,
}) => {
  const subtotal = lineItems.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const late = Math.max(0, Number(lateFee) || 0);
  const damage = Math.max(0, Number(damageFee) || 0);
  const taxable = Math.max(0, subtotal - discountNum + late + damage);
  const rate = Math.max(0, Math.min(100, Number(gstRate) || 0));
  const tax = gstEnabled ? Math.round((taxable * rate) / 100) : 0;
  const total = taxable + tax;
  const advance = Math.max(0, Number(advanceAmount) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);
  const balanceDue = Math.max(0, total - advance - paid);

  return {
    subtotal,
    discount: discountNum,
    lateFee: late,
    damageFee: damage,
    tax,
    total,
    advanceAmount: advance,
    amountPaid: paid,
    balanceDue,
    gstEnabled: Boolean(gstEnabled),
    gstRate: rate,
  };
};
