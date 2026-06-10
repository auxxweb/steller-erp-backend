import { INVENTORY_SCOPE, PRODUCT_STATUS, PRODUCT_TYPE } from '../models/constants/enums.js';

const isValidObjectId = (value) =>
  !value || (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));

const validateBranchLocations = (locations, errors) => {
  if (locations === undefined) return;
  if (!Array.isArray(locations)) {
    errors.push('branchLocations must be an array');
    return;
  }
  locations.forEach((loc, i) => {
    if (!loc?.branch || !isValidObjectId(loc.branch)) {
      errors.push(`branchLocations[${i}].branch must be a valid branch ID`);
    }
    if (loc.quantity !== undefined && (Number.isNaN(Number(loc.quantity)) || loc.quantity < 0)) {
      errors.push(`branchLocations[${i}].quantity must be a non-negative number`);
    }
    if (loc.locationLabel && loc.locationLabel.length > 100) {
      errors.push(`branchLocations[${i}].locationLabel must not exceed 100 characters`);
    }
    if (loc.notes && loc.notes.length > 200) {
      errors.push(`branchLocations[${i}].notes must not exceed 200 characters`);
    }
  });
};

const validatePricing = (pricing, errors, prefix = 'pricing') => {
  if (!pricing) return;
  if (typeof pricing !== 'object') {
    errors.push(`${prefix} must be an object`);
    return;
  }
  const rateFields = ['dailyRate', 'weeklyRate', 'monthlyRate'];
  const validateRateGroup = (group, groupKey) => {
    if (group === undefined) return;
    if (typeof group !== 'object') {
      errors.push(`${prefix}.${groupKey} must be an object`);
      return;
    }
    rateFields.forEach((field) => {
      if (
        group[field] !== undefined &&
        (Number.isNaN(Number(group[field])) || group[field] < 0)
      ) {
        errors.push(`${prefix}.${groupKey}.${field} must be a non-negative number`);
      }
    });
  };

  validateRateGroup(pricing.individual, 'individual');
  validateRateGroup(pricing.combo, 'combo');

  ['depositAmount', 'salePrice'].forEach((field) => {
    if (
      pricing[field] !== undefined &&
      (Number.isNaN(Number(pricing[field])) || pricing[field] < 0)
    ) {
      errors.push(`${prefix}.${field} must be a non-negative number`);
    }
  });
};

export const validateCreateProduct = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Product name is required');
  if (!body.category || !isValidObjectId(body.category)) {
    errors.push('Valid category is required');
  }
  if (body.inventoryScope !== undefined && !Object.values(INVENTORY_SCOPE).includes(body.inventoryScope)) {
    errors.push('Invalid inventoryScope');
  }
  if (body.branch !== undefined && body.branch !== null && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }
  validateBranchLocations(body.branchLocations, errors);
  if (body.sku && body.sku.length > 50) errors.push('SKU must not exceed 50 characters');
  if (body.status && !Object.values(PRODUCT_STATUS).includes(body.status)) {
    errors.push('Invalid product status');
  }
  if (body.type && !Object.values(PRODUCT_TYPE).includes(body.type)) {
    errors.push('Invalid product type');
  }
  if (body.images && !Array.isArray(body.images)) {
    errors.push('Images must be an array');
  }
  validatePricing(body.pricing, errors);

  if (body.advancePayment !== undefined) {
    if (typeof body.advancePayment !== 'object') {
      errors.push('advancePayment must be an object');
    } else {
      if (
        body.advancePayment.required !== undefined &&
        typeof body.advancePayment.required !== 'boolean'
      ) {
        errors.push('advancePayment.required must be a boolean');
      }
      if (body.advancePayment.percentage !== undefined) {
        const pct = Number(body.advancePayment.percentage);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          errors.push('advancePayment.percentage must be between 0 and 100');
        }
      }
    }
  }

  if (body.serialNumbers !== undefined) {
    if (!Array.isArray(body.serialNumbers)) {
      errors.push('serialNumbers must be an array');
    } else if (body.serialNumbers.length > 500) {
      errors.push('Cannot add more than 500 serial numbers at once');
    } else {
      body.serialNumbers.forEach((sn, i) => {
        if (!sn?.trim()) errors.push(`serialNumbers[${i}] cannot be empty`);
      });
    }
  }

  return errors;
};

export const validateUpdateProduct = (body) => {
  const errors = [];

  if (body.name !== undefined && !body.name?.trim()) {
    errors.push('Product name cannot be empty');
  }
  if (body.category !== undefined && !isValidObjectId(body.category)) {
    errors.push('Invalid category ID');
  }
  if (body.status !== undefined && !Object.values(PRODUCT_STATUS).includes(body.status)) {
    errors.push('Invalid product status');
  }
  if (body.type !== undefined && !Object.values(PRODUCT_TYPE).includes(body.type)) {
    errors.push('Invalid product type');
  }
  if (body.images !== undefined && !Array.isArray(body.images)) {
    errors.push('Images must be an array');
  }
  if (body.inventoryScope !== undefined && !Object.values(INVENTORY_SCOPE).includes(body.inventoryScope)) {
    errors.push('Invalid inventoryScope');
  }
  if (body.branch !== undefined && body.branch !== null && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }
  validateBranchLocations(body.branchLocations, errors);
  validatePricing(body.pricing, errors);

  if (body.advancePayment !== undefined) {
    if (typeof body.advancePayment !== 'object') {
      errors.push('advancePayment must be an object');
    } else {
      if (
        body.advancePayment.required !== undefined &&
        typeof body.advancePayment.required !== 'boolean'
      ) {
        errors.push('advancePayment.required must be a boolean');
      }
      if (body.advancePayment.percentage !== undefined) {
        const pct = Number(body.advancePayment.percentage);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          errors.push('advancePayment.percentage must be between 0 and 100');
        }
      }
    }
  }

  return errors;
};

export const validateProductQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }
  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }
  if (query.status && !Object.values(PRODUCT_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (query.branch && !isValidObjectId(query.branch)) {
    errors.push('Invalid branch filter');
  }
  if (query.category && !isValidObjectId(query.category)) {
    errors.push('Invalid category filter');
  }
  if (query.inventoryScope && !Object.values(INVENTORY_SCOPE).includes(query.inventoryScope)) {
    errors.push('Invalid inventoryScope filter');
  }

  return errors;
};
