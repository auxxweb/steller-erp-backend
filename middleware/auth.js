import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/User.js';
import { USER_STATUS } from '../models/constants/enums.js';

const loadUser = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('User no longer exists', 401);
  }

  return user;
};

const assertActiveAccount = (user) => {
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account suspended', 403);
  }

  if (user.status === USER_STATUS.INACTIVE) {
    throw new AppError('Account inactive', 403);
  }

  if (user.status === USER_STATUS.PENDING) {
    throw new AppError('Account pending activation', 403);
  }

  if (!user.isAccountActive()) {
    throw new AppError('Account is not active', 403);
  }
};

/**
 * Protect routes — requires valid access JWT.
 */
export const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Not authorized — access token required', 401);
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  const user = await loadUser(decoded.id);
  assertActiveAccount(user);

  req.user = user;
  req.token = token;
  next();
});

/**
 * Optional auth — attaches user if token present, does not fail.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const user = await loadUser(decoded.id);
    req.user = user;
    req.token = token;
  } catch {
    // Ignore invalid optional tokens
  }

  next();
});

/**
 * Restrict access to specific roles.
 * @param  {...string} roles
 */
export const authorize =
  (...roles) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError('You do not have permission for this action', 403);
    }

    next();
  });

/**
 * Validate token only — same as protect but named for /validate route clarity.
 */
export const validateToken = protect;
