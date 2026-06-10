import bcrypt from 'bcryptjs';
import env from '../config/env.js';

/**
 * Hash a plain-text password.
 */
export const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, env.bcryptSaltRounds);
};

/**
 * Compare plain password with hash.
 */
export const comparePassword = async (plainPassword, hash) => {
  return bcrypt.compare(plainPassword, hash);
};

/**
 * Hash opaque tokens (refresh / reset) for storage.
 */
export const hashToken = async (token) => {
  return bcrypt.hash(token, env.bcryptSaltRounds);
};

/**
 * Compare plain token with stored hash.
 */
export const compareToken = async (plainToken, hash) => {
  return bcrypt.compare(plainToken, hash);
};

const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
};

/**
 * Validate password strength. Returns array of error messages (empty if valid).
 */
export const validatePasswordStrength = (password = '') => {
  const errors = [];

  if (password.length < PASSWORD_RULES.minLength) {
    errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters`);
  }
  if (password.length > PASSWORD_RULES.maxLength) {
    errors.push(`Password must not exceed ${PASSWORD_RULES.maxLength} characters`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }

  return errors;
};
