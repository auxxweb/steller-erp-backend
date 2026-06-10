import { BRANCH_STATUS } from '../models/constants/enums.js';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const CODE_REGEX = /^[A-Z0-9_-]{2,20}$/;

const isValidObjectId = (value) =>
  !value || (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));

const validateAddress = (address, errors, required = false) => {
  if (!address) {
    if (required) errors.push('Address is required');
    return;
  }
  if (typeof address !== 'object') {
    errors.push('Address must be an object');
    return;
  }
  if (required && !address.line1?.trim()) {
    errors.push('Address line 1 is required');
  }
};

export const validateCreateBranch = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Branch name is required');
  if (!body.code?.trim()) {
    errors.push('Branch code is required');
  } else if (!CODE_REGEX.test(body.code.trim().toUpperCase())) {
    errors.push('Branch code must be 2–20 characters (letters, numbers, _ or -)');
  }

  if (body.email && !EMAIL_REGEX.test(body.email)) {
    errors.push('Valid email is required');
  }

  if (body.phone && body.phone.length > 20) {
    errors.push('Phone must not exceed 20 characters');
  }

  if (body.status && !Object.values(BRANCH_STATUS).includes(body.status)) {
    errors.push('Invalid branch status');
  }

  if (body.manager && !isValidObjectId(body.manager)) {
    errors.push('Invalid manager ID');
  }

  validateAddress(body.address, errors, true);

  return errors;
};

export const validateUpdateBranch = (body) => {
  const errors = [];

  if (body.name !== undefined && !body.name?.trim()) {
    errors.push('Branch name cannot be empty');
  }

  if (body.code !== undefined) {
    if (!body.code?.trim()) {
      errors.push('Branch code cannot be empty');
    } else if (!CODE_REGEX.test(body.code.trim().toUpperCase())) {
      errors.push('Branch code must be 2–20 characters (letters, numbers, _ or -)');
    }
  }

  if (body.email !== undefined && body.email && !EMAIL_REGEX.test(body.email)) {
    errors.push('Valid email is required');
  }

  if (body.status !== undefined && !Object.values(BRANCH_STATUS).includes(body.status)) {
    errors.push('Invalid branch status');
  }

  if (body.manager !== undefined && body.manager !== null && !isValidObjectId(body.manager)) {
    errors.push('Invalid manager ID');
  }

  if (body.address !== undefined) {
    validateAddress(body.address, errors, false);
  }

  return errors;
};

export const validateBranchQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }

  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }

  if (query.status && !Object.values(BRANCH_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }

  return errors;
};
