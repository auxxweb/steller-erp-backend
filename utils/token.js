import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token.
 */
export const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Hash a token with SHA-256 for fast lookup (optional companion to bcrypt).
 */
export const sha256 = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};
