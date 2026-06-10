import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/constants/enums.js';
import * as attendanceController from '../controllers/attendanceController.js';

const router = Router();

router.use(protect);

router.get('/me', authorize(ROLES.EMPLOYEE, ROLES.BRANCH_ADMIN), attendanceController.getMyCalendar);

export default router;
