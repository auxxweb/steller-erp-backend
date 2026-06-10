import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import * as authService from '../services/authService.js';
import User from '../models/User.js';
import { ROLES } from '../models/constants/enums.js';

const requestMeta = (req) => ({
  userAgent: req.get('user-agent'),
  ipAddress: req.ip,
});

export const register = asyncHandler(async (req, res) => {
  const userCount = await User.countDocuments();
  const isBootstrap = userCount === 0;

  let creator = req.user || null;

  if (isBootstrap) {
    req.body.role = ROLES.SUPER_ADMIN;
    creator = null;
  } else if (!creator) {
    throw new AppError('Authentication required to register users', 401);
  }

  const data = await authService.registerUser(req.body, creator);

  res.status(201).json({
    success: true,
    message: isBootstrap
      ? 'Super admin account created successfully'
      : 'User registered successfully',
    data,
  });
});

export const login = asyncHandler(async (req, res) => {
  const data = await authService.loginUser(req.body, requestMeta(req));

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data,
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refreshAccessToken(
    req.body.refreshToken,
    requestMeta(req),
  );

  res.status(200).json({
    success: true,
    message: 'Token refreshed successfully',
    data,
  });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logoutUser(req.user._id, req.body.refreshToken);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutUser(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Logged out from all devices',
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getUserProfile(req.user._id);

  res.status(200).json({
    success: true,
    data: { user: user.toSafeJSON() },
  });
});

export const validate = asyncHandler(async (req, res) => {
  const user = await authService.validateAccessToken(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Token is valid',
    data: {
      valid: true,
      user: user.toSafeJSON(),
    },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);

  res.status(200).json({
    success: true,
    ...result,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);

  res.status(200).json({
    success: true,
    ...result,
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user._id, req.body);
  res.status(200).json({ success: true, ...result });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user._id, req.body);
  res.status(200).json({
    success: true,
    message: 'Profile updated',
    data: { user: user.toSafeJSON() },
  });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const user = await authService.updateAccountStatus(
    req.params.userId,
    req.body.status,
    req.user,
  );

  res.status(200).json({
    success: true,
    message: 'Account status updated',
    data: { user: user.toSafeJSON() },
  });
});
