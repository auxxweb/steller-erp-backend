import { configureCloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import AppError from '../utils/AppError.js';
import { ROLES } from '../models/constants/enums.js';
import {
  UPLOAD_FOLDERS,
  UPLOAD_RESOURCE,
} from '../utils/cloudinary/constants.js';
import { uploadBuffers } from '../utils/cloudinary/upload.js';
import { deleteAssets } from '../utils/cloudinary/delete.js';

configureCloudinary();

const assertReady = () => {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'File upload service is not configured. Contact your administrator.',
      503,
    );
  }
};

const resolveBranchScope = (actor, branchIdFromQuery) => {
  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch) {
      throw new AppError('No branch assigned to your account', 403);
    }
    return actor.branch.toString();
  }

  if (actor.role === ROLES.SUPER_ADMIN) {
    return branchIdFromQuery || 'global';
  }

  if (actor.branch) {
    return actor.branch.toString();
  }

  throw new AppError('You do not have permission to upload files', 403);
};

const buildFolder = (resource, branchScope, subfolder) => {
  const base = UPLOAD_FOLDERS[resource] || UPLOAD_FOLDERS[UPLOAD_RESOURCE.GENERAL];
  const parts = [base, branchScope];
  if (subfolder) parts.push(subfolder);
  return parts.join('/');
};

const uploadForResource = async ({
  files,
  resource,
  actor,
  branchId,
  subfolder,
  resourceType = 'auto',
  tags = [],
}) => {
  assertReady();

  if (!files?.length) {
    throw new AppError('No files provided', 400);
  }

  const branchScope = resolveBranchScope(actor, branchId);
  const folder = buildFolder(resource, branchScope, subfolder);
  const uploadTags = [
    `resource:${resource}`,
    `branch:${branchScope}`,
    `user:${actor._id}`,
    ...tags,
  ];

  const { uploaded, failed } = await uploadBuffers(files, {
    folder,
    resourceType,
    tags: uploadTags,
  });

  if (!uploaded.length) {
    throw new AppError('All uploads failed', 400, failed.map((f) => f.reason));
  }

  return {
    uploaded,
    failed,
    folder,
    count: uploaded.length,
  };
};

export const uploadProductImages = (files, actor, { branchId, productId } = {}) =>
  uploadForResource({
    files,
    resource: UPLOAD_RESOURCE.PRODUCT,
    actor,
    branchId,
    subfolder: productId || undefined,
    resourceType: 'image',
    tags: productId ? [`product:${productId}`] : [],
  });

export const uploadProductUnitImages = (files, actor, { branchId, unitId, productId } = {}) =>
  uploadForResource({
    files,
    resource: UPLOAD_RESOURCE.PRODUCT,
    actor,
    branchId,
    subfolder: unitId ? `units/${unitId}` : productId ? `${productId}/units` : 'units',
    resourceType: 'image',
    tags: [
      ...(productId ? [`product:${productId}`] : []),
      ...(unitId ? [`unit:${unitId}`] : []),
    ],
  });

export const uploadCustomerDocuments = (files, actor, { branchId, customerId } = {}) =>
  uploadForResource({
    files,
    resource: UPLOAD_RESOURCE.CUSTOMER,
    actor,
    branchId,
    subfolder: customerId ? `docs/${customerId}` : 'docs',
    resourceType: 'auto',
    tags: customerId ? [`customer:${customerId}`] : [],
  });

export const uploadUserDocuments = (files, actor, { branchId } = {}) =>
  uploadForResource({
    files,
    resource: UPLOAD_RESOURCE.USER,
    actor,
    branchId,
    subfolder: 'employees',
    resourceType: 'auto',
    tags: branchId ? [`branch:${branchId}`] : [],
  });

export const uploadMaintenanceImages = (files, actor, { branchId, maintenanceId } = {}) =>
  uploadForResource({
    files,
    resource: UPLOAD_RESOURCE.MAINTENANCE,
    actor,
    branchId,
    subfolder: maintenanceId || undefined,
    resourceType: 'image',
    tags: maintenanceId ? [`maintenance:${maintenanceId}`] : [],
  });

export const uploadCategoryImage = (files, actor, { branchId, categoryId } = {}) =>
  uploadForResource({
    files,
    resource: UPLOAD_RESOURCE.CATEGORY,
    actor,
    branchId: branchId || 'global',
    subfolder: categoryId || undefined,
    resourceType: 'image',
    tags: categoryId ? [`category:${categoryId}`] : [],
  });

export const removeUploadedAssets = async (items = []) => {
  assertReady();

  if (!items.length) {
    throw new AppError('No assets specified for deletion', 400);
  }

  return deleteAssets(items);
};
