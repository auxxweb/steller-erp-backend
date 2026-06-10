import { ID_PROOF_TYPE } from '../models/constants/enums.js';

export const validateCreateGuarantor = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Guarantor name is required');
  if (!body.phone?.trim()) errors.push('Phone is required');
  if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) {
    errors.push('Valid email is required');
  }
  if (body.idProof?.type && !Object.values(ID_PROOF_TYPE).includes(body.idProof.type)) {
    errors.push('Invalid ID proof type');
  }

  return errors;
};

export const validateUpdateGuarantor = (body) => {
  const errors = validateCreateGuarantor({
    ...body,
    name: body.name ?? 'x',
    phone: body.phone ?? 'x',
  }).filter((e) => !e.includes('required'));

  if (body.name !== undefined && !body.name?.trim()) {
    errors.push('Name cannot be empty');
  }

  return [...new Set(errors)];
};
