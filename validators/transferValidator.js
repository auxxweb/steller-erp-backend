import { TRANSFER_STATUS } from '../models/constants/enums.js';

const isValidObjectId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export const validateCreateTransfer = (body) => {
  const errors = [];

  if (body.fromBranch !== undefined && !isValidObjectId(body.fromBranch)) {
    errors.push('Invalid fromBranch ID');
  }
  if (!isValidObjectId(body.toBranch)) {
    errors.push('Valid toBranch is required');
  }
  if (!body.items?.length) {
    errors.push('At least one unit is required');
  } else {
    body.items.forEach((item, idx) => {
      if (!isValidObjectId(item.productUnit)) {
        errors.push(`items[${idx}].productUnit is invalid`);
      }
    });
  }

  return errors;
};

export const validateUpdateTransfer = (body) => {
  const errors = [];
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    errors.push('notes must be a string');
  }
  if (body.trackingNotes !== undefined && typeof body.trackingNotes !== 'string') {
    errors.push('trackingNotes must be a string');
  }
  return errors;
};

export const validateTransferQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }
  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }
  if (query.status && !Object.values(TRANSFER_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (query.fromBranch && !isValidObjectId(query.fromBranch)) {
    errors.push('Invalid fromBranch filter');
  }
  if (query.toBranch && !isValidObjectId(query.toBranch)) {
    errors.push('Invalid toBranch filter');
  }
  if (query.branch && !isValidObjectId(query.branch)) {
    errors.push('Invalid branch filter');
  }
  if (query.direction && !['incoming', 'outgoing'].includes(query.direction)) {
    errors.push('direction must be incoming or outgoing');
  }

  return errors;
};

export const validateTransferScan = (body) => {
  const errors = [];
  const scanned =
    body.scannedValue?.trim() || body.qrPayload?.trim() || body.unitId?.trim();
  if (!scanned) {
    errors.push('scannedValue, qrPayload, or unitId is required');
  }
  return errors;
};

export const validateCancelTransfer = (body) => {
  const errors = [];
  if (body.reason !== undefined && typeof body.reason !== 'string') {
    errors.push('reason must be a string');
  }
  return errors;
};
