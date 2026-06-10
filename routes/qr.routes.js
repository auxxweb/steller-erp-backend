import { Router } from 'express';
import { verify, scan, lookup, ensureQr } from '../controllers/qrController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { validateQrVerify, validateQrScan } from '../validators/qrValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const scanRoles = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.EMPLOYEE,
  ROLES.DELIVERY_STAFF,
);

router.use(protect, scanRoles);

router.get('/lookup', lookup);
router.post('/verify', validateBody(validateQrVerify), verify);
router.post('/scan', validateBody(validateQrScan), scan);
router.post('/units/:unitId/generate', ensureQr);

export default router;
