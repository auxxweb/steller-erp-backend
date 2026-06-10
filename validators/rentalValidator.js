import { RENTAL_STATUS, RENTAL_TYPE } from '../models/constants/enums.js';

const isValidObjectId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const validateLineItems = (items, errors, { required = true } = {}) => {
  if (!items?.length) {
    if (required) errors.push('At least one line item or combo is required');
    return;
  }

  items.forEach((item, idx) => {
    if (!isValidObjectId(item.product)) {
      errors.push(`items[${idx}].product is invalid`);
    }
    if (item.quantity !== undefined && (Number.isNaN(Number(item.quantity)) || item.quantity < 1)) {
      errors.push(`items[${idx}].quantity must be at least 1`);
    }
    if (item.productUnit && !isValidObjectId(item.productUnit)) {
      errors.push(`items[${idx}].productUnit is invalid`);
    }
    if (item.rateType && !['daily', 'weekly', 'monthly', 'flat'].includes(item.rateType)) {
      errors.push(`items[${idx}].rateType is invalid`);
    }
  });
};

export const validateCreateRental = (body) => {
  const errors = [];

  if (!isValidObjectId(body.customer)) errors.push('Valid customer ID is required');
  if (body.rentalType && !Object.values(RENTAL_TYPE).includes(body.rentalType)) {
    errors.push('Invalid rentalType');
  }
  if (!body.scheduledStartAt && body.rentalType !== RENTAL_TYPE.DIRECT) {
    errors.push('scheduledStartAt is required');
  }
  if (!body.scheduledEndAt) errors.push('scheduledEndAt is required');
  if (body.branch !== undefined && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }
  if (body.combo && !isValidObjectId(body.combo)) {
    errors.push('Invalid combo ID');
  }
  if (body.guarantor && !isValidObjectId(body.guarantor)) {
    errors.push('Invalid guarantor ID');
  }
  if (!body.combo) {
    validateLineItems(body.items, errors);
    if (body.rentalType === RENTAL_TYPE.DIRECT && body.items?.length) {
      body.items.forEach((item, idx) => {
        const qty = Number(item.quantity) || 1;
        if (qty === 1 && !item.productUnit) {
          errors.push(`items[${idx}].productUnit is required for direct rental`);
        }
      });
    }
  } else if (!body.items?.length) {
    validateLineItems([], errors, { required: false });
  } else {
    validateLineItems(body.items, errors, { required: false });
  }

  if (body.taxRate !== undefined && (Number.isNaN(Number(body.taxRate)) || body.taxRate < 0)) {
    errors.push('taxRate must be non-negative');
  }

  return errors;
};

export const validateUpdateRental = (body) => {
  const errors = [];
  if (body.scheduledStartAt === '') errors.push('scheduledStartAt cannot be empty');
  if (body.scheduledEndAt === '') errors.push('scheduledEndAt cannot be empty');
  if (body.guarantor && !isValidObjectId(body.guarantor)) {
    errors.push('Invalid guarantor ID');
  }
  return errors;
};

export const validateRentalQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }
  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 200)) {
    errors.push('Limit must be between 1 and 200');
  }
  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = statuses.filter((s) => !Object.values(RENTAL_STATUS).includes(s));
    if (invalid.length) errors.push('Invalid status filter');
  }
  if (query.branch && !isValidObjectId(query.branch)) {
    errors.push('Invalid branch filter');
  }
  if (query.customer && !isValidObjectId(query.customer)) {
    errors.push('Invalid customer filter');
  }
  if (query.rentalType && !Object.values(RENTAL_TYPE).includes(query.rentalType)) {
    errors.push('Invalid rentalType filter');
  }

  return errors;
};

export const validateCheckAvailability = (body) => {
  const errors = [];

  if (!body.scheduledStartAt) errors.push('scheduledStartAt is required');
  if (!body.scheduledEndAt) errors.push('scheduledEndAt is required');
  if (body.branch !== undefined && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }
  if (body.combo && !isValidObjectId(body.combo)) {
    errors.push('Invalid combo ID');
  }
  if (!body.combo) {
    validateLineItems(body.items, errors);
  } else if (body.items?.length) {
    validateLineItems(body.items, errors, { required: false });
  }

  if (body.excludeRentalId && !isValidObjectId(body.excludeRentalId)) {
    errors.push('Invalid excludeRentalId');
  }

  return errors;
};

export const validateCancelRental = (body) => {
  const errors = [];
  if (!body.reason?.trim()) errors.push('Cancellation reason is required');
  return errors;
};

export const validatePickupRental = (body) => {
  const errors = [];
  if (body.deliveryStaff && !isValidObjectId(body.deliveryStaff)) {
    errors.push('Invalid deliveryStaff ID');
  }
  return errors;
};
