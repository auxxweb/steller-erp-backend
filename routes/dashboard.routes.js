import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();

router.use(protect);
router.get('/', dashboardController.getWorkspaceDashboard);

export default router;
