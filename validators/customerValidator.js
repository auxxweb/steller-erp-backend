import {
  CUSTOMER_STATUS,
  CUSTOMER_TYPE,
  ID_PROOF_TYPE,
} from '../models/constants/enums.js';

const isValidObjectId = (value) =>
  !value || (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));

const validateBusinessRules = (body, errors) => {
  const type = body.customerType || CUSTOMER_TYPE.INDIVIDUAL;

  if (type === CUSTOMER_TYPE.BUSINESS && !body.company?.trim()) {
    errors.push('Company name is required for business customers');
  }

  if (body.gstin && body.gstin.length !== 15) {
    errors.push('GSTIN must be 15 characters');
  }
};

export const validateCreateCustomer = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Customer name is required');
  if (!body.phone?.trim()) errors.push('Phone is required');
  if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) {
    errors.push('Valid email is required');
  }
  if (body.branch !== undefined && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }
  if (body.customerType && !Object.values(CUSTOMER_TYPE).includes(body.customerType)) {
    errors.push('Invalid customer type');
  }
  if (body.status && !Object.values(CUSTOMER_STATUS).includes(body.status)) {
    errors.push('Invalid customer status');
  }
  if (body.creditLimit !== undefined && (Number.isNaN(Number(body.creditLimit)) || body.creditLimit < 0)) {
    errors.push('Credit limit must be non-negative');
  }

  validateBusinessRules(body, errors);
  return errors;
};

export const validateUpdateCustomer = (body) => {
  const errors = validateCreateCustomer({
    ...body,
    name: body.name ?? 'placeholder',
    phone: body.phone ?? 'placeholder',
  }).filter((e) => !e.includes('required'));

  if (body.name !== undefined && !body.name?.trim()) {
    errors.push('Customer name cannot be empty');
  }
  if (body.phone !== undefined && !body.phone?.trim()) {
    errors.push('Phone cannot be empty');
  }

  return [...new Set(errors)];
};

export const validateCustomerQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }
  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }
  if (query.status && !Object.values(CUSTOMER_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (query.customerType && !Object.values(CUSTOMER_TYPE).includes(query.customerType)) {
    errors.push('Invalid customer type filter');
  }
  if (query.branch && !isValidObjectId(query.branch)) {
    errors.push('Invalid branch filter');
  }
  if (query.riskLevel && !['low', 'medium', 'high'].includes(query.riskLevel)) {
    errors.push('Invalid risk level filter');
  }

  return errors;
};

export const validateBlockCustomer = (body) => {
  const errors = [];
  if (!body.reason?.trim()) {
    errors.push('Block reason is required');
  }
  return errors;
};

export const validateIdProofMeta = (body) => {
  const errors = [];
  if (!body.type || !Object.values(ID_PROOF_TYPE).includes(body.type)) {
    errors.push('Valid ID proof type is required');
  }
  if (!body.number?.trim()) {
    errors.push('ID proof number is required');
  }
  return errors;
};
