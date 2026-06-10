import { Router } from 'express';
import {
  getStats,
  list,
  getOne,
  create,
  update,
  remove,
} from '../controllers/categoryController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateCategoryQuery,
} from '../validators/categoryValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const inventoryRoles = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);

router.use(protect, inventoryRoles);

router.get('/stats', getStats);
router.get('/', validateQuery(validateCategoryQuery), list);
router.get('/:id', getOne);
router.post('/', validateBody(validateCreateCategory), create);
router.patch('/:id', validateBody(validateUpdateCategory), update);
router.delete('/:id', remove);

export default router;
