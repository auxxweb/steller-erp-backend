import { Router } from 'express';
import {
  stats,
  list,
  lookupIdentity,
  getOne,
  create,
  update,
  remove,
  block,
  unblock,
  getRisk,
  analyzeRisk,
  recalculateRisk,
  getRentals,
  uploadIdProofs,
  verifyIdProof,
  addIdProofMeta,
  listGuarantors,
  createGuarantor,
  getGuarantor,
  updateGuarantor,
  removeGuarantor,
} from '../controllers/customerController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { uploadDocuments } from '../middleware/upload.js';
import {
  validateCreateCustomer,
  validateUpdateCustomer,
  validateCustomerQuery,
  validateBlockCustomer,
  validateIdProofMeta,
} from '../validators/customerValidator.js';
import {
  validateCreateGuarantor,
  validateUpdateGuarantor,
} from '../validators/guarantorValidator.js';
import { ROLES } from '../models/constants/enums.js';

const router = Router();

const customerRead = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE);
const customerWrite = authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);

router.use(protect);

router.get('/stats', customerRead, validateQuery(validateCustomerQuery), stats);
router.get('/lookup', customerRead, lookupIdentity);
router.get('/', customerRead, validateQuery(validateCustomerQuery), list);
router.post('/', customerWrite, validateBody(validateCreateCustomer), create);

router.get('/:id/rentals', customerRead, getRentals);
router.get('/:id/risk', customerRead, getRisk);
router.get('/:id/risk/analysis', customerRead, analyzeRisk);
router.post('/:id/risk/recalculate', customerWrite, recalculateRisk);
router.post('/:id/block', customerWrite, validateBody(validateBlockCustomer), block);
router.post('/:id/unblock', customerWrite, unblock);

router.post(
  '/:id/id-proofs/upload',
  customerWrite,
  ...uploadDocuments('documents', 5),
  uploadIdProofs,
);
router.post('/:id/id-proofs', customerWrite, validateBody(validateIdProofMeta), addIdProofMeta);
router.post('/:id/id-proofs/:proofId/verify', customerWrite, verifyIdProof);

router.get('/:id/guarantors', customerRead, listGuarantors);
router.post('/:id/guarantors', customerWrite, validateBody(validateCreateGuarantor), createGuarantor);
router.get('/:id/guarantors/:guarantorId', customerRead, getGuarantor);
router.patch(
  '/:id/guarantors/:guarantorId',
  customerWrite,
  validateBody(validateUpdateGuarantor),
  updateGuarantor,
);
router.delete('/:id/guarantors/:guarantorId', customerWrite, removeGuarantor);

router.get('/:id', customerRead, getOne);
router.patch('/:id', customerWrite, validateBody(validateUpdateCustomer), update);
router.delete('/:id', customerWrite, remove);

export default router;
