import { ROLES, USER_STATUS } from '../models/constants/enums.js';
import { validatePasswordStrength } from '../utils/password.js';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const isValidEmail = (email) => typeof email === 'string' && EMAIL_REGEX.test(email.trim());

const isValidObjectId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export const validateRegister = (body) => {
  const errors = [];

  if (!body.name?.trim()) errors.push('Name is required');
  if (!isValidEmail(body.email)) errors.push('Valid email is required');

  const passwordErrors = validatePasswordStrength(body.password);
  errors.push(...passwordErrors);

  if (body.role && !Object.values(ROLES).includes(body.role)) {
    errors.push('Invalid role');
  }

  if (body.branch && !isValidObjectId(body.branch)) {
    errors.push('Invalid branch ID');
  }

  const rolesRequiringBranch = [ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE, ROLES.DELIVERY_STAFF];
  if (body.role && rolesRequiringBranch.includes(body.role) && !body.branch) {
    errors.push('Branch is required for this role');
  }

  if (body.status && !Object.values(USER_STATUS).includes(body.status)) {
    errors.push('Invalid status');
  }

  if (body.employeePosition && !['branch_manager', 'sales_staff'].includes(body.employeePosition)) {
    errors.push('Invalid employee position');
  }

  if (body.shiftIds !== undefined) {
    if (!Array.isArray(body.shiftIds)) {
      errors.push('shiftIds must be an array');
    } else if (body.shiftIds.some((id) => !isValidObjectId(String(id)))) {
      errors.push('Invalid shift ID in shiftIds');
    }
  }

  return errors;
};

export const validateLogin = (body) => {
  const errors = [];

  if (!isValidEmail(body.email)) errors.push('Valid email is required');
  if (!body.password) errors.push('Password is required');

  return errors;
};

export const validateRefreshToken = (body) => {
  const errors = [];
  if (!body.refreshToken?.trim()) errors.push('Refresh token is required');
  return errors;
};

export const validateForgotPassword = (body) => {
  const errors = [];
  if (!isValidEmail(body.email)) errors.push('Valid email is required');
  return errors;
};

export const validateResetPassword = (body) => {
  const errors = [];

  if (!body.token?.trim()) errors.push('Reset token is required');
  errors.push(...validatePasswordStrength(body.password));

  return errors;
};

export const validateChangePassword = (body) => {
  const errors = [];
  if (!body.currentPassword) errors.push('Current password is required');
  if (!body.newPassword) errors.push('New password is required');
  else errors.push(...validatePasswordStrength(body.newPassword));
  if (body.confirmPassword !== undefined && body.newPassword !== body.confirmPassword) {
    errors.push('Passwords do not match');
  }
  return errors;
};

export const validateUpdateProfile = (body) => {
  const errors = [];
  if (body.name !== undefined && !body.name?.trim()) errors.push('Name is required');
  if (body.phone !== undefined && body.phone !== null && String(body.phone).length > 20) {
    errors.push('Phone number is too long');
  }
  return errors;
};

export const validateUpdateStatus = (body) => {
  const errors = [];
  if (!body.status || !Object.values(USER_STATUS).includes(body.status)) {
    errors.push('Valid status is required (active, inactive, suspended, pending)');
  }
  return errors;
};
