import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { ROLES } from '../models/constants/enums.js';
import { uploadDocuments } from '../middleware/upload.js';
import {
  createEmployee,
  updateStaff,
  regeneratePassword,
  viewPassword,
} from '../controllers/staffController.js';
import { getUserCalendar } from '../controllers/attendanceController.js';
import { list, remove } from '../controllers/userController.js';
import { validateUserListQuery } from '../validators/userValidator.js';

const router = Router();

router.use(protect);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  validateQuery(validateUserListQuery),
  list,
);

router.delete('/:userId', authorize(ROLES.SUPER_ADMIN), remove);

// Branch staff (employee accounts with address, document images, shift schedule)
router.post(
  '/employees',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  ...uploadDocuments('documents', 5),
  createEmployee,
);

router.patch(
  '/:userId',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  updateStaff,
);

router.get(
  '/:userId/attendance',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  getUserCalendar,
);

// Admin password controls (regenerate + view last-generated plaintext)
router.post(
  '/:userId/password/regenerate',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  regeneratePassword,
);

router.get(
  '/:userId/password',
  authorize(ROLES.SUPER_ADMIN),
  viewPassword,
);

export default router;
