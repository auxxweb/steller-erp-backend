import {
  PRODUCT_CONDITION,
  PRODUCT_UNIT_STATUS,
} from '../models/constants/enums.js';

const isValidObjectId = (value) =>
  value && typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const VALID_STATUS_TRANSITIONS = {
  [PRODUCT_UNIT_STATUS.AVAILABLE]: [
    PRODUCT_UNIT_STATUS.RESERVED,
    PRODUCT_UNIT_STATUS.RENTED,
    PRODUCT_UNIT_STATUS.MAINTENANCE,
    PRODUCT_UNIT_STATUS.IN_TRANSFER,
    PRODUCT_UNIT_STATUS.RETIRED,
    PRODUCT_UNIT_STATUS.LOST,
  ],
  [PRODUCT_UNIT_STATUS.RESERVED]: [
    PRODUCT_UNIT_STATUS.AVAILABLE,
    PRODUCT_UNIT_STATUS.RENTED,
    PRODUCT_UNIT_STATUS.MAINTENANCE,
    PRODUCT_UNIT_STATUS.IN_TRANSFER,
  ],
  [PRODUCT_UNIT_STATUS.RENTED]: [
    PRODUCT_UNIT_STATUS.AVAILABLE,
    PRODUCT_UNIT_STATUS.MAINTENANCE,
    PRODUCT_UNIT_STATUS.LOST,
  ],
  [PRODUCT_UNIT_STATUS.MAINTENANCE]: [
    PRODUCT_UNIT_STATUS.AVAILABLE,
    PRODUCT_UNIT_STATUS.RETIRED,
  ],
  [PRODUCT_UNIT_STATUS.IN_TRANSFER]: [
    PRODUCT_UNIT_STATUS.AVAILABLE,
    PRODUCT_UNIT_STATUS.MAINTENANCE,
  ],
  [PRODUCT_UNIT_STATUS.RETIRED]: [],
  [PRODUCT_UNIT_STATUS.LOST]: [PRODUCT_UNIT_STATUS.AVAILABLE, PRODUCT_UNIT_STATUS.RETIRED],
};

export const canTransitionStatus = (from, to) => {
  if (from === to) return true;
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
};

export const validateCreateUnit = (body) => {
  const errors = [];

  if (!body.serialNumber?.trim()) {
    errors.push('Serial number is required');
  } else if (body.serialNumber.length > 100) {
    errors.push('Serial number must not exceed 100 characters');
  }

  if (body.condition && !Object.values(PRODUCT_CONDITION).includes(body.condition)) {
    errors.push('Invalid condition');
  }
  if (body.status && !Object.values(PRODUCT_UNIT_STATUS).includes(body.status)) {
    errors.push('Invalid unit status');
  }
  if (body.branch && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }

  return errors;
};

export const validateBulkCreateUnits = (body) => {
  const errors = [];

  if (!Array.isArray(body.units) || body.units.length === 0) {
    errors.push('units array is required with at least one item');
    return errors;
  }
  if (body.units.length > 100) {
    errors.push('Cannot create more than 100 units at once');
  }

  body.units.forEach((unit, i) => {
    const unitErrors = validateCreateUnit(unit);
    unitErrors.forEach((e) => errors.push(`units[${i}]: ${e}`));
  });

  return errors;
};

export const validateUpdateUnit = (body) => {
  const errors = [];

  if (body.serialNumber !== undefined) {
    if (!body.serialNumber?.trim()) errors.push('Serial number cannot be empty');
    else if (body.serialNumber.length > 100) {
      errors.push('Serial number must not exceed 100 characters');
    }
  }

  if (body.condition !== undefined && !Object.values(PRODUCT_CONDITION).includes(body.condition)) {
    errors.push('Invalid condition');
  }
  if (body.status !== undefined && !Object.values(PRODUCT_UNIT_STATUS).includes(body.status)) {
    errors.push('Invalid unit status');
  }
  if (body.branch !== undefined && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      errors.push('images must be an array');
    } else if (body.images.length > 2) {
      errors.push('images cannot have more than 2 items');
    } else {
      body.images.forEach((img, i) => {
        if (!img || typeof img !== 'object') errors.push(`images[${i}] must be an object`);
        else if (!img.url?.trim()) errors.push(`images[${i}].url is required`);
      });
    }
  }

  return errors;
};

export const validateStatusUpdate = (body) => {
  const errors = [];

  if (!body.status || !Object.values(PRODUCT_UNIT_STATUS).includes(body.status)) {
    errors.push('Valid status is required');
  }

  return errors;
};

export const validateLocationUpdate = (body) => {
  const errors = [];

  if (!body.location || typeof body.location !== 'object') {
    errors.push('location object is required');
  }

  return errors;
};

export const validateUnitQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }
  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }
  if (query.status && !Object.values(PRODUCT_UNIT_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (query.condition && !Object.values(PRODUCT_CONDITION).includes(query.condition)) {
    errors.push('Invalid condition filter');
  }

  return errors;
};
