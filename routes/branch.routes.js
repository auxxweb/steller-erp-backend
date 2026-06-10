import { Router } from 'express';
import {
  getStats,
  list,
  getOne,
  getMine,
  getDashboard,
  create,
  update,
  remove,
  listManagers,
} from '../controllers/branchController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  validateCreateBranch,
  validateUpdateBranch,
  validateBranchQuery,
} from '../validators/branchValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const superAdminOnly = authorize(ROLES.SUPER_ADMIN);
const adminRoles = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);

router.use(protect);

router.get('/stats', superAdminOnly, getStats);
router.get('/managers', superAdminOnly, listManagers);
router.get('/me', adminRoles, getMine);

router.get('/', adminRoles, validateQuery(validateBranchQuery), list);
router.get('/:id/dashboard', adminRoles, getDashboard);
router.get('/:id', adminRoles, getOne);

router.post('/', superAdminOnly, validateBody(validateCreateBranch), create);
router.patch('/:id', superAdminOnly, validateBody(validateUpdateBranch), update);
router.delete('/:id', superAdminOnly, remove);

export default router;
