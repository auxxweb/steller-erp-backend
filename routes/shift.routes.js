import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as shiftController from '../controllers/shiftController.js';

const router = Router();

router.use(protect);

router.post('/', authorize(ROLES.SUPER_ADMIN), shiftController.create);
router.get('/', authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE), shiftController.list);
router.patch('/users/:userId/shifts', authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN), shiftController.assignToUser);

router.patch('/:shiftId', authorize(ROLES.SUPER_ADMIN), shiftController.update);
router.delete('/:shiftId', authorize(ROLES.SUPER_ADMIN), shiftController.remove);

export default router;

