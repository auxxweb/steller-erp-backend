import { Router } from 'express';
import {
  stats,
  list,
  getOne,
  calculatePrice,
  checkAvailability,
  preview,
  create,
  update,
  remove,
} from '../controllers/comboController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  validateCreateCombo,
  validateUpdateCombo,
  validateComboQuery,
  validateComboPreview,
  validateComboAvailabilityQuery,
} from '../validators/comboValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const comboRead = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE);
const comboWrite = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);

router.use(protect);

router.get('/stats', comboRead, validateQuery(validateComboQuery), stats);
router.get('/', comboRead, validateQuery(validateComboQuery), list);
router.post('/preview', comboRead, validateBody(validateComboPreview), preview);
router.post('/', comboWrite, validateBody(validateCreateCombo), create);

router.get('/:id/price', comboRead, calculatePrice);
router.get(
  '/:id/availability',
  comboRead,
  validateQuery(validateComboAvailabilityQuery),
  checkAvailability,
);
router.get('/:id', comboRead, getOne);
router.patch('/:id', comboWrite, validateBody(validateUpdateCombo), update);
router.delete('/:id', comboWrite, remove);

export default router;
