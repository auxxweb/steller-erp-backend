import User from '../models/User.js';
import Shift from '../models/Shift.js';
import { ROLES, USER_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { signAccessToken, signResetToken, verifyResetToken } from '../utils/jwt.js';
import { hashToken, compareToken, validatePasswordStrength } from '../utils/password.js';
import { generateSecureToken } from '../utils/token.js';
import env from '../config/env.js';
import * as tokenService from './tokenService.js';
import * as attendanceService from './attendanceService.js';

const formatUser = (user) => user.toSafeJSON();

const buildAuthResponse = async (user, meta = {}) => {
  const accessToken = signAccessToken(user);
  const { refreshToken } = await tokenService.createRefreshToken(user, meta);

  return {
    accessToken,
    refreshToken,
    user: formatUser(user),
  };
};

const assertAccountCanAuthenticate = (user) => {
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account has been suspended. Contact support.', 403);
  }

  if (user.status === USER_STATUS.INACTIVE) {
    throw new AppError('Account is inactive', 403);
  }

  if (user.status === USER_STATUS.PENDING) {
    throw new AppError('Account is pending activation', 403);
  }

  if (!user.isAccountActive()) {
    throw new AppError('Account is not active', 403);
  }
};

const resolveRegisterRole = (requestedRole, creator) => {
  if (!creator) {
    return requestedRole || ROLES.EMPLOYEE;
  }

  if (creator.role === ROLES.SUPER_ADMIN) {
    return requestedRole || ROLES.EMPLOYEE;
  }

  if (creator.role === ROLES.BRANCH_ADMIN) {
    const allowed = [ROLES.EMPLOYEE, ROLES.DELIVERY_STAFF];
    if (requestedRole && !allowed.includes(requestedRole)) {
      throw new AppError('Branch admin can only create employees or delivery staff', 403);
    }
    return requestedRole || ROLES.EMPLOYEE;
  }

  throw new AppError('You do not have permission to register users', 403);
};

const resolveRegisterBranch = (requestedBranch, creator) => {
  if (creator?.role === ROLES.BRANCH_ADMIN) {
    if (!creator.branch) {
      throw new AppError('Branch admin must be assigned to a branch', 400);
    }
    return creator.branch;
  }

  return requestedBranch || null;
};

/**
 * Register a new user (admin-created accounts).
 */
export const registerUser = async (payload, creator = null) => {
  const exists = await User.findOne({ email: payload.email.toLowerCase() });

  if (exists) {
    throw new AppError('Email already registered', 409);
  }

  const role = resolveRegisterRole(payload.role, creator);
  const branch = resolveRegisterBranch(payload.branch, creator);

  const requiresBranch = [ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE, ROLES.DELIVERY_STAFF];
  if (requiresBranch.includes(role) && !branch) {
    throw new AppError('Branch is required for this role', 400);
  }

  let shiftIds = [];
  if (payload.shiftIds?.length) {
    if (!branch) throw new AppError('Branch is required when assigning shifts', 400);
    const shifts = await Shift.find({
      _id: { $in: payload.shiftIds },
      branch,
      status: { $ne: 'inactive' },
    }).select('_id');
    if (shifts.length !== payload.shiftIds.length) {
      throw new AppError('One or more shifts are invalid for this branch', 400);
    }
    shiftIds = payload.shiftIds;
  }

  let address;
  if (payload.address?.line1?.trim()) {
    address = {
      line1: payload.address.line1.trim(),
      line2: payload.address.line2?.trim() || undefined,
      city: payload.address.city?.trim() || '',
      state: payload.address.state?.trim() || '',
      postalCode: payload.address.postalCode?.trim() || undefined,
    };
  }

  const documents = Array.isArray(payload.documents)
    ? payload.documents.map((d) => ({
        name: d.name || 'document',
        url: d.url,
        publicId: d.publicId,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
      }))
    : [];

  const user = await User.create({
    name: payload.name.trim(),
    email: payload.email.toLowerCase().trim(),
    password: payload.password,
    role,
    branch,
    phone: payload.phone,
    avatar: payload.avatar || null,
    status: payload.status || USER_STATUS.ACTIVE,
    employeePosition:
      role === ROLES.EMPLOYEE ? payload.employeePosition || 'sales_staff' : undefined,
    shiftIds,
    address,
    documents,
    createdBy: creator?._id,
  });

  return buildAuthResponse(user);
};

/**
 * Authenticate user and return token pair.
 */
export const loginUser = async ({ email, password }, meta = {}) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }

  assertAccountCanAuthenticate(user);

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  try {
    await attendanceService.recordLogin(user);
  } catch {
    // Attendance must not block authentication
  }

  return buildAuthResponse(user, meta);
};

/**
 * Refresh access token using refresh token JWT.
 */
export const refreshAccessToken = async (refreshTokenJwt, meta = {}) => {
  const { user, refreshToken } = await tokenService.rotateRefreshToken(refreshTokenJwt, meta);

  const accessToken = signAccessToken(user);

  return {
    accessToken,
    refreshToken,
    user: formatUser(user),
  };
};

/**
 * Logout — revoke refresh token(s).
 */
export const logoutUser = async (userId, refreshTokenJwt = null) => {
  try {
    await attendanceService.recordLogout(userId);
  } catch {
    // Attendance must not block logout
  }

  if (refreshTokenJwt) {
    try {
      const { verifyRefreshToken } = await import('../utils/jwt.js');
      const decoded = verifyRefreshToken(refreshTokenJwt);
      await tokenService.revokeRefreshToken(decoded);
    } catch {
      // Token invalid — still revoke all for safety
      await tokenService.revokeAllUserTokens(userId);
    }
  } else {
    await tokenService.revokeAllUserTokens(userId);
  }
};

/**
 * Get user profile by ID.
 */
export const getUserProfile = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

/**
 * Validate access token and return user (for /validate endpoint).
 */
export const validateAccessToken = async (userId) => {
  const user = await getUserProfile(userId);
  assertAccountCanAuthenticate(user);
  return user;
};

/**
 * Request password reset — always returns success message (no email enumeration).
 */
export const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return {
      message: 'If an account exists with that email, a reset link has been sent.',
    };
  }

  const resetTokenJwt = signResetToken(user._id);
  const resetTokenHash = await hashToken(resetTokenJwt);

  user.passwordResetToken = resetTokenHash;
  user.passwordResetExpires = new Date(Date.now() + env.passwordResetExpiresMs);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.appUrl}/reset-password?token=${resetTokenJwt}`;

  if (env.nodeEnv === 'development') {
    console.log('[auth] Password reset link:', resetUrl);
  }

  return {
    message: 'If an account exists with that email, a reset link has been sent.',
    ...(env.nodeEnv === 'development' && { resetUrl, resetToken: resetTokenJwt }),
  };
};

/**
 * Reset password with JWT reset token.
 */
export const resetPassword = async ({ token, password }) => {
  let decoded;

  try {
    decoded = verifyResetToken(token);
  } catch {
    throw new AppError('Invalid or expired reset token', 400);
  }

  const user = await User.findById(decoded.id).select(
    '+passwordResetToken +passwordResetExpires +password',
  );

  if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  if (user.passwordResetExpires < new Date()) {
    throw new AppError('Reset token has expired', 400);
  }

  const tokenValid = await compareToken(token, user.passwordResetToken);

  if (!tokenValid) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  await tokenService.revokeAllUserTokens(user._id);

  return {
    message: 'Password reset successful. Please sign in with your new password.',
  };
};

/**
 * Change password for the signed-in user.
 */
export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw new AppError('Current password is incorrect', 400);

  const passwordErrors = validatePasswordStrength(newPassword);
  if (passwordErrors.length) throw new AppError(passwordErrors[0], 400);

  if (await user.comparePassword(newPassword)) {
    throw new AppError('New password must be different from your current password', 400);
  }

  user.password = newPassword;
  await user.save();
  await tokenService.revokeAllUserTokens(user._id);

  return { message: 'Password updated successfully. Please sign in again on other devices.' };
};

/**
 * Update own profile fields.
 */
export const updateProfile = async (userId, payload) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  if (payload.name !== undefined) {
    if (!payload.name?.trim()) throw new AppError('Name is required', 400);
    user.name = payload.name.trim();
  }
  if (payload.phone !== undefined) {
    user.phone = payload.phone?.trim() || undefined;
  }

  await user.save();
  return user;
};

/**
 * Update account status (admin only).
 */
export const updateAccountStatus = async (userId, status, actor) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw new AppError('Cannot modify super admin account', 403);
  }

  if (
    actor.role === ROLES.BRANCH_ADMIN &&
    user.branch?.toString() !== actor.branch?.toString()
  ) {
    throw new AppError('Cannot modify users outside your branch', 403);
  }

  user.status = status;
  await user.save();

  if (status !== USER_STATUS.ACTIVE) {
    await tokenService.revokeAllUserTokens(user._id);
  }

  return user;
};
