import { Router } from 'express';
import {
  uploadProducts,
  uploadProductUnitImages,
  uploadCustomerDocs,
  uploadUserDocs,
  uploadMaintenance,
  uploadCategory,
  removeAssets,
  getSignedParams,
} from '../controllers/uploadController.js';
import { protect, authorize } from '../middleware/auth.js';
import {
  uploadImages,
  uploadImageSingle,
  uploadDocuments,
} from '../middleware/upload.js';
import { ROLES } from '../models/constants/enums.js';
import {
  UPLOAD_LIMITS,
} from '../utils/cloudinary/constants.js';

const router = Router();

const uploadRoles = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.EMPLOYEE,
);

router.use(protect, uploadRoles);

router.get('/sign', getSignedParams);

router.post(
  '/products',
  ...uploadImages('images', UPLOAD_LIMITS.productMaxFiles),
  uploadProducts,
);

router.post(
  '/products/units',
  ...uploadImages('images', 2),
  uploadProductUnitImages,
);

router.post(
  '/customers/documents',
  ...uploadDocuments('documents', UPLOAD_LIMITS.customerMaxFiles),
  uploadCustomerDocs,
);

router.post(
  '/users/documents',
  ...uploadDocuments('documents', UPLOAD_LIMITS.customerMaxFiles),
  uploadUserDocs,
);

router.post(
  '/maintenance',
  ...uploadImages('images', UPLOAD_LIMITS.maintenanceMaxFiles),
  uploadMaintenance,
);

router.post(
  '/categories',
  ...uploadImageSingle('image'),
  uploadCategory,
);

router.delete('/', removeAssets);

export default router;
