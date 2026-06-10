import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { ROLES } from '../models/constants/enums.js';
import * as invoiceController from '../controllers/invoiceController.js';
import {
  validateInvoiceListQuery,
  validateUpdateInvoice,
} from '../validators/invoiceValidator.js';

const router = Router();
const invoiceRoles = [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE];

router.use(protect);

router.get(
  '/',
  authorize(...invoiceRoles),
  validateQuery(validateInvoiceListQuery),
  invoiceController.list,
);
router.get(
  '/:id/html',
  authorize(...invoiceRoles),
  invoiceController.getHtml,
);
router.get(
  '/:id/whatsapp',
  authorize(...invoiceRoles),
  invoiceController.getWhatsAppUrl,
);
router.get(
  '/:id',
  authorize(...invoiceRoles),
  invoiceController.getOne,
);
router.patch(
  '/:id',
  authorize(...invoiceRoles),
  validateBody(validateUpdateInvoice),
  invoiceController.update,
);
router.post(
  '/:id/finalize',
  authorize(...invoiceRoles),
  invoiceController.finalize,
);
router.post(
  '/from-rental/:rentalId',
  authorize(...invoiceRoles),
  invoiceController.generateFromRental,
);
router.post(
  '/:id/void',
  authorize(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN),
  invoiceController.voidInvoice,
);

export default router;
