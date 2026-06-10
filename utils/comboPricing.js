import { COMBO_PRICING_RULE } from '../models/constants/enums.js';
import { resolveUnitRate } from './rentalPricing.js';

/**
 * Duration multiplier for a rate type (per unit, before quantity).
 */
export const durationMultiplier = (durationDays, rateType) => {
  const days = Math.max(1, durationDays);
  switch (rateType) {
    case 'weekly':
      return Math.ceil(days / 7);
    case 'monthly':
      return Math.ceil(days / 30);
    case 'flat':
      return 1;
    case 'daily':
    default:
      return days;
  }
};

/**
 * Catalog subtotal for one product line (no combo discount).
 */
export const catalogLineSubtotal = ({
  unitRate,
  quantity,
  durationDays,
  rateType,
}) => {
  const mult = durationMultiplier(durationDays, rateType);
  return unitRate * Math.max(1, quantity) * mult;
};

/**
 * Compute combo bundle pricing with automatic calculations and custom discounts.
 */
export const computeComboPricing = ({
  combo,
  products = [],
  durationDays = 1,
  rateType = 'daily',
  taxRate = 0,
}) => {
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  const rule = combo.pricingRule || COMBO_PRICING_RULE.SUM_WITH_DISCOUNT;
  const mult = durationMultiplier(durationDays, rateType);

  const lineDetails = (combo.items || []).map((entry) => {
    const productId = entry.product?._id?.toString() || entry.product?.toString();
    const product = productMap.get(productId);
    const unitRate = product ? resolveUnitRate(product.pricing, rateType) : 0;
    const qty = entry.quantity || 1;
    const catalogSubtotal = catalogLineSubtotal({
      unitRate,
      quantity: qty,
      durationDays,
      rateType,
    });

    return {
      productId,
      productName: product?.name,
      sku: product?.sku,
      quantity: qty,
      unitRate,
      catalogSubtotal,
      lineDiscount: 0,
      lineSubtotal: catalogSubtotal,
    };
  });

  const catalogTotal = lineDetails.reduce((s, l) => s + l.catalogSubtotal, 0);

  let bundleSubtotal = catalogTotal;
  let discountTotal = 0;
  let bundleRate = null;

  if (rule === COMBO_PRICING_RULE.FIXED_BUNDLE) {
    bundleRate = resolveUnitRate(combo.pricing || {}, rateType);
    bundleSubtotal = bundleRate * mult;
    discountTotal = Math.max(0, catalogTotal - bundleSubtotal);
  } else if (
    rule === COMBO_PRICING_RULE.SUM_WITH_DISCOUNT ||
    rule === COMBO_PRICING_RULE.SUM_PRODUCTS
  ) {
    const pct = combo.pricing?.discountPercent || 0;
    const flat = combo.pricing?.discountAmount || 0;
    const pctDiscount = (catalogTotal * pct) / 100;
    discountTotal = Math.min(catalogTotal, pctDiscount + flat);
    bundleSubtotal = catalogTotal - discountTotal;
  }

  if (catalogTotal > 0 && discountTotal > 0) {
    lineDetails.forEach((line) => {
      const share = line.catalogSubtotal / catalogTotal;
      line.lineDiscount = Math.round(discountTotal * share * 100) / 100;
      line.lineSubtotal = line.catalogSubtotal - line.lineDiscount;
    });
  }

  const tax = Math.round((bundleSubtotal * taxRate) / 100);
  const total = bundleSubtotal + tax;
  const deposit = combo.pricing?.depositAmount || 0;
  const savingsPercent =
    catalogTotal > 0 ? Math.round((discountTotal / catalogTotal) * 100) : 0;

  return {
    pricingRule: rule,
    rateType,
    durationDays,
    lines: lineDetails,
    catalogTotal,
    discountPercent: combo.pricing?.discountPercent || 0,
    discountAmount: combo.pricing?.discountAmount || 0,
    discountTotal,
    savingsPercent,
    bundleRate,
    bundleSubtotal,
    deposit,
    tax,
    total,
    perDay: mult > 0 ? Math.round((bundleSubtotal / mult) * 100) / 100 : bundleSubtotal,
  };
};

/**
 * Rental line payloads with computed unit rates (for booking engine).
 */
export const comboToRentalLines = (pricingResult, comboId) =>
  pricingResult.lines.map((line) => ({
    product: line.productId,
    quantity: line.quantity,
    combo: comboId,
    rateType: pricingResult.rateType,
    unitRate: line.quantity > 0 ? line.lineSubtotal / (line.quantity * durationMultiplier(pricingResult.durationDays, pricingResult.rateType)) : line.unitRate,
    lineDiscount: line.lineDiscount,
    catalogSubtotal: line.catalogSubtotal,
  }));

export default computeComboPricing;
