import { Router } from 'express';
import {
  inventoryStats,
  branchInventory,
  list,
  getOne,
  getAvailability,
  getHistory,
  create,
  update,
  remove,
  listUnits,
  createUnit,
  createUnitsBulk,
  lookupUnit,
  getUnit,
  updateUnit,
  updateUnitStatus,
  updateUnitLocation,
  getUnitQr,
  regenerateUnitQr,
  getUnitHistory,
  removeUnit,
} from '../controllers/productController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  validateCreateProduct,
  validateUpdateProduct,
  validateProductQuery,
} from '../validators/productValidator.js';
import {
  validateCreateUnit,
  validateBulkCreateUnits,
  validateUpdateUnit,
  validateStatusUpdate,
  validateLocationUpdate,
  validateUnitQuery,
} from '../validators/productUnitValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const inventoryRead = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE);
const inventoryWrite = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);

router.use(protect);

router.get('/inventory/stats', inventoryRead, inventoryStats);
router.get('/inventory/branch', inventoryRead, branchInventory);

router.get('/units/lookup', inventoryRead, lookupUnit);
router.get('/units/:unitId', inventoryRead, getUnit);
router.get('/units/:unitId/qr', inventoryRead, getUnitQr);
router.post('/units/:unitId/qr/regenerate', inventoryWrite, regenerateUnitQr);
router.get('/units/:unitId/history', inventoryRead, getUnitHistory);
router.patch('/units/:unitId/status', inventoryWrite, validateBody(validateStatusUpdate), updateUnitStatus);
router.patch('/units/:unitId/location', inventoryWrite, validateBody(validateLocationUpdate), updateUnitLocation);
router.patch('/units/:unitId', inventoryWrite, validateBody(validateUpdateUnit), updateUnit);
router.delete('/units/:unitId', inventoryWrite, removeUnit);

router.get('/', inventoryRead, validateQuery(validateProductQuery), list);
router.post('/', inventoryWrite, validateBody(validateCreateProduct), create);

router.get('/:productId/units', inventoryRead, validateQuery(validateUnitQuery), listUnits);
router.post(
  '/:productId/units/bulk',
  inventoryWrite,
  validateBody(validateBulkCreateUnits),
  createUnitsBulk,
);
router.post(
  '/:productId/units',
  inventoryWrite,
  validateBody(validateCreateUnit),
  createUnit,
);

router.get('/:id/availability', inventoryRead, getAvailability);
router.get('/:id/history', inventoryRead, getHistory);
router.get('/:id', inventoryRead, getOne);
router.patch('/:id', inventoryWrite, validateBody(validateUpdateProduct), update);
router.delete('/:id', inventoryWrite, remove);

export default router;
