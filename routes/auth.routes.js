import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  validate,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  updateStatus,
} from '../controllers/authController.js';
import { protect, authorize, optionalAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  validateRegister,
  validateLogin,
  validateRefreshToken,
  validateForgotPassword,
  validateResetPassword,
  validateUpdateStatus,
  validateChangePassword,
  validateUpdateProfile,
} from '../validators/authValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

// Public
router.post('/login', validateBody(validateLogin), login);
router.post('/refresh', validateBody(validateRefreshToken), refresh);
router.post('/forgot-password', validateBody(validateForgotPassword), forgotPassword);
router.post('/reset-password', validateBody(validateResetPassword), resetPassword);

// Register — bootstrap first super_admin OR admin-only (optional auth)
router.post('/register', optionalAuth, validateBody(validateRegister), register);

// Protected
router.use(protect);

router.get('/me', me);
router.get('/validate', validate);
router.post('/logout', logout);
router.post('/logout-all', logoutAll);
router.post('/change-password', validateBody(validateChangePassword), changePassword);
router.patch('/profile', validateBody(validateUpdateProfile), updateProfile);

router.patch(
  '/users/:userId/status',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  validateBody(validateUpdateStatus),
  updateStatus,
);

export default router;
