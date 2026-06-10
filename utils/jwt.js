import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import AppError from './AppError.js';

export const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  RESET: 'reset',
};

const sign = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn });

const verify = (token, secret) => jwt.verify(token, secret);

/**
 * Sign short-lived access token.
 */
export const signAccessToken = (user) =>
  sign(
    {
      id: user._id.toString(),
      role: user.role,
      type: TOKEN_TYPES.ACCESS,
    },
    env.jwtSecret,
    env.jwtAccessExpiresIn,
  );

/**
 * Sign long-lived refresh token (also stored hashed in DB).
 */
export const signRefreshToken = (user, tokenId) =>
  sign(
    {
      id: user._id.toString(),
      tokenId,
      type: TOKEN_TYPES.REFRESH,
    },
    env.jwtRefreshSecret,
    env.jwtRefreshExpiresIn,
  );

/**
 * Sign password reset token (sent via email link).
 */
export const signResetToken = (userId) =>
  sign(
    {
      id: userId.toString(),
      type: TOKEN_TYPES.RESET,
    },
    env.jwtSecret,
    env.jwtResetExpiresIn,
  );

/**
 * Verify access token and ensure correct type.
 */
export const verifyAccessToken = (token) => {
  const decoded = verify(token, env.jwtSecret);

  if (decoded.type && decoded.type !== TOKEN_TYPES.ACCESS) {
    throw new AppError('Invalid access token', 401);
  }

  return decoded;
};

/**
 * Verify refresh token JWT.
 */
export const verifyRefreshToken = (token) => {
  const decoded = verify(token, env.jwtRefreshSecret);

  if (decoded.type !== TOKEN_TYPES.REFRESH) {
    throw new AppError('Invalid refresh token', 401);
  }

  return decoded;
};

/**
 * Verify password reset JWT.
 */
export const verifyResetToken = (token) => {
  const decoded = verify(token, env.jwtSecret);

  if (decoded.type !== TOKEN_TYPES.RESET) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  return decoded;
};

/** @deprecated Use signAccessToken */
export const signToken = signAccessToken;

/** @deprecated Use verifyAccessToken */
export const verifyToken = verifyAccessToken;
