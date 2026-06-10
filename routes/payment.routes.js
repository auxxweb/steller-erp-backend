import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as paymentController from '../controllers/paymentController.js';

const router = Router();

router.use(protect);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  paymentController.list,
);
router.post(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  paymentController.create,
);

export default router;
