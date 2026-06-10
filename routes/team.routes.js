import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as teamController from '../controllers/teamController.js';

const router = Router();

router.use(protect);
router.use(authorize(ROLES.BRANCH_ADMIN));

router.get('/', teamController.list);
router.get('/:userId', teamController.getOne);

export default router;
