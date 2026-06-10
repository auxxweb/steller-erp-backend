import RefreshToken from '../models/RefreshToken.js';
import User from '../models/User.js';
import { hashToken, compareToken } from '../utils/password.js';
import { signRefreshToken } from '../utils/jwt.js';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';

const parseExpiryMs = () => {
  const match = String(env.jwtRefreshExpiresIn).match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return value * multipliers[unit];
};

/**
 * Issue refresh token record + signed JWT.
 */
export const createRefreshToken = async (user, meta = {}) => {
  const expiresAt = new Date(Date.now() + parseExpiryMs());

  const doc = await RefreshToken.create({
    user: user._id,
    tokenHash: 'pending',
    expiresAt,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  const refreshToken = signRefreshToken(user, doc._id.toString());
  doc.tokenHash = await hashToken(refreshToken);
  await doc.save();

  return { refreshToken, documentId: doc._id };
};

/**
 * Rotate refresh token — revoke old session, issue new pair.
 */
export const rotateRefreshToken = async (refreshTokenJwt, meta = {}) => {
  const { verifyRefreshToken } = await import('../utils/jwt.js');
  const decoded = verifyRefreshToken(refreshTokenJwt);

  const stored = await RefreshToken.findById(decoded.tokenId);

  if (!stored || stored.user.toString() !== decoded.id) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (!stored.isValid()) {
    await RefreshToken.updateMany(
      { user: stored.user, revokedAt: null },
      { revokedAt: new Date() },
    );
    throw new AppError('Refresh token reuse detected — please sign in again', 401);
  }

  const matches = await compareToken(refreshTokenJwt, stored.tokenHash);

  if (!matches) {
    stored.revokedAt = new Date();
    await stored.save();
    throw new AppError('Invalid refresh token', 401);
  }

  stored.revokedAt = new Date();
  await stored.save();

  const user = await User.findById(decoded.id);

  if (!user || !user.isAccountActive()) {
    throw new AppError('Account is not active', 403);
  }

  const issued = await createRefreshToken(user, meta);
  stored.replacedByToken = issued.documentId.toString();
  await stored.save();

  return { user, refreshToken: issued.refreshToken };
};

export const revokeRefreshToken = async (decoded) => {
  if (!decoded?.tokenId) return;
  await RefreshToken.findByIdAndUpdate(decoded.tokenId, { revokedAt: new Date() });
};

export const revokeAllUserTokens = async (userId) => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() },
  );
};
