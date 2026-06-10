import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as leaveController from '../controllers/leaveController.js';

const router = Router();

router.use(protect);

router.post('/', authorize(ROLES.EMPLOYEE, ROLES.BRANCH_ADMIN), leaveController.apply);
router.get('/me', authorize(ROLES.EMPLOYEE, ROLES.BRANCH_ADMIN), leaveController.listMine);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  leaveController.listForApproval,
);

router.patch(
  '/:leaveId/approve',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  leaveController.approve,
);

router.patch(
  '/:leaveId/reject',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  leaveController.reject,
);

export default router;
