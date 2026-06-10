import { CATEGORY_STATUS } from '../models/constants/enums.js';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_REGEX = /^(https?:\/\/|\/)[^\s]+$/i;

const isValidObjectId = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));

export const validateCreateCategory = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Category name is required');

  if (body.slug?.trim() && !SLUG_REGEX.test(body.slug.trim().toLowerCase())) {
    errors.push('Slug must be lowercase letters, numbers, and hyphens only');
  }

  if (body.description && body.description.length > 500) {
    errors.push('Description must not exceed 500 characters');
  }

  if (body.image?.trim() && !URL_REGEX.test(body.image.trim())) {
    errors.push('Image must be a valid URL or path');
  }

  if (body.status && !Object.values(CATEGORY_STATUS).includes(body.status)) {
    errors.push('Invalid category status');
  }

  if (body.branch !== undefined && body.branch !== null && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }

  return errors;
};

export const validateUpdateCategory = (body) => {
  const errors = [];

  if (body.name !== undefined && !body.name?.trim()) {
    errors.push('Category name cannot be empty');
  }

  if (body.slug !== undefined) {
    if (!body.slug?.trim()) {
      errors.push('Slug cannot be empty');
    } else if (!SLUG_REGEX.test(body.slug.trim().toLowerCase())) {
      errors.push('Slug must be lowercase letters, numbers, and hyphens only');
    }
  }

  if (body.description !== undefined && body.description && body.description.length > 500) {
    errors.push('Description must not exceed 500 characters');
  }

  if (body.image !== undefined && body.image?.trim() && !URL_REGEX.test(body.image.trim())) {
    errors.push('Image must be a valid URL or path');
  }

  if (body.status !== undefined && !Object.values(CATEGORY_STATUS).includes(body.status)) {
    errors.push('Invalid category status');
  }

  if (body.branch !== undefined && body.branch !== null && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }

  return errors;
};

export const validateCategoryQuery = (query) => {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (query.page && (Number.isNaN(page) || page < 1)) {
    errors.push('Page must be a positive number');
  }

  if (query.limit && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }

  if (query.status && !Object.values(CATEGORY_STATUS).includes(query.status)) {
    errors.push('Invalid status filter');
  }

  if (query.branch && query.branch !== 'global' && !isValidObjectId(query.branch)) {
    errors.push('Invalid branch filter');
  }

  return errors;
};
