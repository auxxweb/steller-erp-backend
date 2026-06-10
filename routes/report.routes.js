import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { ROLES } from '../models/constants/enums.js';
import * as reportController from '../controllers/reportController.js';
import { validateReportQuery } from '../validators/reportValidator.js';

const router = Router();
const reportRoles = [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN];

router.use(protect);
router.use(authorize(...reportRoles));

router.get(
  '/rental-jobs',
  validateQuery(validateReportQuery),
  reportController.rentalJobs,
);
router.get(
  '/sales',
  validateQuery(validateReportQuery),
  reportController.sales,
);
router.get(
  '/rental-jobs/export',
  validateQuery(validateReportQuery),
  reportController.exportRentalJobs,
);
router.get(
  '/sales/export',
  validateQuery(validateReportQuery),
  reportController.exportSales,
);

export default router;
