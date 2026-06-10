import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import * as uploadService from '../services/uploadService.js';
import { createSignedUploadParams } from '../utils/cloudinary/upload.js';
import { UPLOAD_FOLDERS, UPLOAD_RESOURCE } from '../utils/cloudinary/constants.js';
import { AUDIT_ACTION } from '../models/constants/enums.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

/** AuditLog requires a valid ObjectId; prefer resource id, else branch, else actor. */
const resolveAuditEntityId = (req, ...candidates) => {
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : '';
    if (s && mongoose.isValidObjectId(s)) return s;
  }
  return req.user?._id;
};

const mapFilesWithMeta = (uploaded, reqFiles) =>
  uploaded.map((asset, index) => ({
    ...asset,
    originalName: reqFiles[index]?.originalname,
    mimeType: reqFiles[index]?.mimetype,
  }));

export const uploadProducts = asyncHandler(async (req, res) => {
  const branchId = req.body.branchId || req.query.branchId;
  const productId = req.body.productId || req.query.productId;
  const result = await uploadService.uploadProductImages(req.files, req.user, {
    branchId,
    productId,
  });

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.UPLOAD,
    entity: 'ProductImage',
    entityId: resolveAuditEntityId(req, productId, branchId),
    summary: `Uploaded ${result.count} product image(s)`,
    metadata: { folder: result.folder, publicIds: result.uploaded.map((u) => u.publicId) },
  });

  res.status(201).json({
    success: true,
    message: `${result.count} image(s) uploaded`,
    data: {
      images: mapFilesWithMeta(result.uploaded, req.files),
      failed: result.failed,
    },
  });
});

export const uploadProductUnitImages = asyncHandler(async (req, res) => {
  const branchId = req.body.branchId || req.query.branchId;
  const unitId = req.body.unitId || req.query.unitId;
  const productId = req.body.productId || req.query.productId;
  const result = await uploadService.uploadProductUnitImages(req.files, req.user, {
    branchId,
    unitId,
    productId,
  });

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.UPLOAD,
    entity: 'ProductUnitImage',
    entityId: resolveAuditEntityId(req, unitId, productId, branchId),
    summary: `Uploaded ${result.count} unit image(s)`,
    metadata: { folder: result.folder, publicIds: result.uploaded.map((u) => u.publicId) },
  });

  res.status(201).json({
    success: true,
    message: `${result.count} image(s) uploaded`,
    data: {
      images: mapFilesWithMeta(result.uploaded, req.files),
      failed: result.failed,
    },
  });
});

export const uploadCustomerDocs = asyncHandler(async (req, res) => {
  const branchId = req.body.branchId || req.query.branchId;
  const customerId = req.body.customerId || req.query.customerId;
  const result = await uploadService.uploadCustomerDocuments(req.files, req.user, {
    branchId,
    customerId,
  });

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.UPLOAD,
    entity: 'CustomerDocument',
    entityId: resolveAuditEntityId(req, customerId, branchId),
    summary: `Uploaded ${result.count} customer document(s)`,
    metadata: { folder: result.folder },
  });

  res.status(201).json({
    success: true,
    message: `${result.count} document(s) uploaded`,
    data: {
      documents: mapFilesWithMeta(result.uploaded, req.files),
      failed: result.failed,
    },
  });
});

export const uploadUserDocs = asyncHandler(async (req, res) => {
  const branchId = req.body.branchId || req.query.branchId;
  const result = await uploadService.uploadUserDocuments(req.files, req.user, {
    branchId,
  });

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.UPLOAD,
    entity: 'UserDocument',
    entityId: resolveAuditEntityId(req, branchId),
    summary: `Uploaded ${result.count} staff document(s)`,
    metadata: { folder: result.folder, branchId: branchId || null },
  });

  res.status(201).json({
    success: true,
    message: `${result.count} document(s) uploaded`,
    data: {
      documents: mapFilesWithMeta(result.uploaded, req.files),
      failed: result.failed,
    },
  });
});

export const uploadMaintenance = asyncHandler(async (req, res) => {
  const branchId = req.body.branchId || req.query.branchId;
  const maintenanceId = req.body.maintenanceId || req.query.maintenanceId;
  const result = await uploadService.uploadMaintenanceImages(req.files, req.user, {
    branchId,
    maintenanceId,
  });

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.UPLOAD,
    entity: 'MaintenanceImage',
    entityId: resolveAuditEntityId(req, maintenanceId, branchId),
    summary: `Uploaded ${result.count} maintenance image(s)`,
    metadata: { folder: result.folder },
  });

  res.status(201).json({
    success: true,
    message: `${result.count} image(s) uploaded`,
    data: {
      images: mapFilesWithMeta(result.uploaded, req.files),
      failed: result.failed,
    },
  });
});

export const uploadCategory = asyncHandler(async (req, res) => {
  const files = req.file ? [req.file] : req.files;
  const result = await uploadService.uploadCategoryImage(files, req.user, {
    branchId: req.body.branchId || req.query.branchId,
    categoryId: req.body.categoryId || req.query.categoryId,
  });

  res.status(201).json({
    success: true,
    message: 'Category image uploaded',
    data: {
      image: { ...result.uploaded[0], originalName: req.file?.originalname },
      failed: result.failed,
    },
  });
});

export const removeAssets = asyncHandler(async (req, res) => {
  const items = req.body.items || req.body.publicIds?.map((publicId) => ({ publicId })) || [];

  const result = await uploadService.removeUploadedAssets(items);

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.DELETE,
    entity: 'CloudinaryAsset',
    entityId: resolveAuditEntityId(req),
    summary: `Deleted ${result.deleted.length} asset(s) from Cloudinary`,
    metadata: { deletedCount: result.deleted.length },
  });

  res.status(200).json({
    success: true,
    message: `${result.deleted.length} asset(s) deleted`,
    data: result,
  });
});

export const getSignedParams = asyncHandler(async (req, res) => {
  const resource = req.query.resource || UPLOAD_RESOURCE.PRODUCT;
  const branchId = req.query.branchId || req.user.branch?.toString() || 'global';
  const folder = `${UPLOAD_FOLDERS[resource] || UPLOAD_FOLDERS[UPLOAD_RESOURCE.GENERAL]}/${branchId}`;
  const resourceType = req.query.resourceType || 'image';

  const params = createSignedUploadParams({ folder, resourceType });

  res.status(200).json({
    success: true,
    data: { upload: params },
  });
});
