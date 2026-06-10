import { COMBO_STATUS, COMBO_PRICING_RULE } from '../models/constants/enums.js';

const isValidObjectId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const validateItems = (items, errors) => {
  if (!items?.length) {
    errors.push('At least one product is required');
    return;
  }
  items.forEach((item, idx) => {
    if (!isValidObjectId(item.product)) {
      errors.push(`items[${idx}].product is invalid`);
    }
    if (item.quantity !== undefined && (Number.isNaN(Number(item.quantity)) || item.quantity < 1)) {
      errors.push(`items[${idx}].quantity must be at least 1`);
    }
  });
};

const validatePricing = (pricing, errors) => {
  if (!pricing) return;
  if (pricing.discountPercent != null && (pricing.discountPercent < 0 || pricing.discountPercent > 100)) {
    errors.push('discountPercent must be between 0 and 100');
  }
  if (pricing.discountAmount != null && pricing.discountAmount < 0) {
    errors.push('discountAmount must be non-negative');
  }
};

export const validateCreateCombo = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Combo name is required');
  if (!body.code?.trim()) errors.push('Combo code is required');
  if (body.branch !== undefined && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }
  if (body.pricingRule && !Object.values(COMBO_PRICING_RULE).includes(body.pricingRule)) {
    errors.push('Invalid pricing rule');
  }
  if (body.status && !Object.values(COMBO_STATUS).includes(body.status)) {
    errors.push('Invalid status');
  }

  validateItems(body.items, errors);
  validatePricing(body.pricing, errors);

  return errors;
};

export const validateUpdateCombo = (body) => {
  const errors = [];

  if (body.name !== undefined && !body.name?.trim()) {
    errors.push('Name cannot be empty');
  }
  if (body.code !== undefined && !body.code?.trim()) {
    errors.push('Code cannot be empty');
  }
  if (body.pricingRule && !Object.values(COMBO_PRICING_RULE).includes(body.pricingRule)) {
    errors.push('Invalid pricing rule');
  }
  if (body.items) validateItems(body.items, errors);
  validatePricing(body.pricing, errors);

  return errors;
};

export const validateComboQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }
  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }
  if (query.status && !Object.values(COMBO_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (query.branch && !isValidObjectId(query.branch)) {
    errors.push('Invalid branch filter');
  }

  return errors;
};

export const validateComboPreview = (body) => {
  const errors = validateCreateCombo({
    ...body,
    name: body.name ?? 'preview',
    code: body.code ?? 'PREVIEW',
  });

  if (body.rateType && !['daily', 'weekly', 'monthly', 'flat'].includes(body.rateType)) {
    errors.push('Invalid rate type');
  }

  return errors;
};

export const validateComboAvailabilityQuery = (query) => {
  const errors = [];
  if (!query.scheduledStartAt) errors.push('scheduledStartAt is required');
  if (!query.scheduledEndAt) errors.push('scheduledEndAt is required');
  if (query.excludeRentalId && !isValidObjectId(query.excludeRentalId)) {
    errors.push('Invalid excludeRentalId');
  }
  return errors;
};
