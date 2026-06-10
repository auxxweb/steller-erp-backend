import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as maintenanceController from '../controllers/maintenanceController.js';

const router = Router();

router.use(protect);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  maintenanceController.list,
);
router.get(
  '/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  maintenanceController.getOne,
);
router.post(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  maintenanceController.create,
);
router.post(
  '/:id/start',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  maintenanceController.start,
);
router.post(
  '/:id/complete',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE),
  maintenanceController.complete,
);
router.post(
  '/:id/cancel',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  maintenanceController.cancel,
);

export default router;
