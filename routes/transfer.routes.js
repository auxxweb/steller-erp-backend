import { Router } from 'express';
import {
  stats,
  list,
  getOne,
  create,
  update,
  approve,
  cancel,
  dispatchScan,
  deliveryScan,
} from '../controllers/transferController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  validateCreateTransfer,
  validateUpdateTransfer,
  validateTransferQuery,
  validateTransferScan,
  validateCancelTransfer,
} from '../validators/transferValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const transferRead = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.EMPLOYEE,
  ROLES.DELIVERY_STAFF,
);
const transferWrite = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE);
const transferApprove = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);
const transferScan = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.EMPLOYEE,
  ROLES.DELIVERY_STAFF,
);

router.use(protect);

router.get('/stats', transferRead, validateQuery(validateTransferQuery), stats);
router.get('/', transferRead, validateQuery(validateTransferQuery), list);
router.post('/', transferWrite, validateBody(validateCreateTransfer), create);

router.get('/:id', transferRead, getOne);
router.patch('/:id', transferWrite, validateBody(validateUpdateTransfer), update);
router.post('/:id/approve', transferApprove, approve);
router.post('/:id/cancel', transferWrite, validateBody(validateCancelTransfer), cancel);
router.post(
  '/:id/dispatch-scan',
  transferScan,
  validateBody(validateTransferScan),
  dispatchScan,
);
router.post(
  '/:id/delivery-scan',
  transferScan,
  validateBody(validateTransferScan),
  deliveryScan,
);

export default router;
