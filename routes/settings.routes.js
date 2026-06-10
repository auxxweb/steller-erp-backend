import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as settingsController from '../controllers/settingsController.js';
import { validateBranchSettings } from '../validators/settingsValidator.js';

const router = Router();

router.use(protect);

router.get('/', settingsController.getWorkspace);
router.patch('/branch', validateBody(validateBranchSettings), settingsController.updateBranch);

export default router;
