import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import {
  listUnits,
  getUnit,
  downloadUnitPng,
  downloadBulkZip,
} from '../controllers/qrCatalogController.js';

const router = Router();

const superAdminOnly = [protect, authorize(ROLES.SUPER_ADMIN)];

router.get('/units', ...superAdminOnly, listUnits);
router.get('/units/bulk.zip', ...superAdminOnly, downloadBulkZip);
router.get('/units/:unitId', ...superAdminOnly, getUnit);
router.get('/units/:unitId/download.png', ...superAdminOnly, downloadUnitPng);

export default router;
