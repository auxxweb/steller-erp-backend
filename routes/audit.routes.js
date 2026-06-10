import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as auditController from '../controllers/auditController.js';

const router = Router();

router.use(protect);
router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  auditController.list,
);

export default router;
