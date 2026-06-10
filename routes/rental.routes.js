import { Router } from 'express';
import {
  stats,
  list,
  checkAvailability,
  getOne,
  create,
  update,
  reserve,
  pickup,
  activate,
  returnRental,
  maintenance,
  cancel,
  close,
  confirm,
  timeline,
} from '../controllers/rentalController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  validateCreateRental,
  validateUpdateRental,
  validateRentalQuery,
  validateCheckAvailability,
  validateCancelRental,
  validatePickupRental,
} from '../validators/rentalValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const rentalRead = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.EMPLOYEE,
  ROLES.DELIVERY_STAFF,
);
const rentalWrite = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE);
const rentalOps = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.EMPLOYEE,
  ROLES.DELIVERY_STAFF,
);

router.use(protect);

router.get('/stats', rentalRead, validateQuery(validateRentalQuery), stats);
router.get('/', rentalRead, validateQuery(validateRentalQuery), list);
router.post('/check-availability', rentalRead, validateBody(validateCheckAvailability), checkAvailability);
router.post('/', rentalWrite, validateBody(validateCreateRental), create);

router.get('/:id', rentalRead, getOne);
router.patch('/:id', rentalWrite, validateBody(validateUpdateRental), update);

router.post('/:id/reserve', rentalWrite, reserve);
router.post('/:id/confirm', rentalWrite, confirm);
router.get('/:id/timeline', rentalRead, timeline);
router.post('/:id/pickup', rentalOps, validateBody(validatePickupRental), pickup);
router.post('/:id/activate', rentalWrite, activate);
router.post('/:id/return', rentalOps, returnRental);
router.post('/:id/maintenance', rentalWrite, maintenance);
router.post('/:id/cancel', rentalWrite, validateBody(validateCancelRental), cancel);
router.post('/:id/close', rentalWrite, close);

export default router;
