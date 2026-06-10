import asyncHandler from '../utils/asyncHandler.js';
import * as uploadService from '../services/uploadService.js';
import * as staffService from '../services/staffService.js';
import AppError from '../utils/AppError.js';

const parseMaybeJson = (value) => {
  if (!value) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseIdArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed).map(String);
      } catch {
        return [];
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

export const createEmployee = asyncHandler(async (req, res) => {
  const files = req.files?.documents || req.files || [];
  let uploadedDocs = [];
  if (files?.length) {
    const result = await uploadService.uploadUserDocuments(files, req.user, {
      branchId: req.user.role === 'super_admin' ? req.body.branch : req.user.branch,
    });
    if (result.failed?.length && !result.uploaded?.length) {
      throw new AppError(result.failed[0]?.reason || 'Document upload failed', 400);
    }
    uploadedDocs = result.uploaded || [];
  }

  // If the client already uploaded documents, it can send `documents[]` in the body.
  const bodyDocs = parseMaybeJson(req.body.documents) || [];

  const documents =
    (uploadedDocs || []).length > 0
      ? (uploadedDocs || []).map((doc, idx) => ({
          name: files?.[idx]?.originalname || doc.originalName || 'document',
          url: doc.url,
          publicId: doc.publicId,
          mimeType: files?.[idx]?.mimetype || doc.mimeType,
          uploadedAt: doc.createdAt || new Date(),
        }))
      : Array.isArray(bodyDocs)
        ? bodyDocs.map((d) => ({
            name: d.name || 'document',
            url: d.url,
            publicId: d.publicId,
            mimeType: d.mimeType,
            uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
          }))
        : [];

  const payload = {
    branch: req.user.role === 'super_admin' ? req.body.branch : req.user.branch,
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    phone: req.body.phone,
    employeePosition: req.body.employeePosition || 'sales_staff',
    shiftIds: parseIdArray(req.body.shiftIds),
    address: parseMaybeJson(req.body.address),
    employeeId: req.body.employeeId,
    avatar: req.body.avatar,
  };

  const user = await staffService.createBranchStaff({ payload, actor: req.user, documents });
  res.status(201).json({ success: true, message: 'Staff created', data: { user } });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const user = await staffService.updateStaffProfile({
    userId: req.params.userId,
    payload: req.body,
    actor: req.user,
  });
  res.status(200).json({ success: true, message: 'User updated', data: { user } });
});

export const regeneratePassword = asyncHandler(async (req, res) => {
  const nextPassword = await staffService.regeneratePassword({
    userId: req.params.userId,
    actor: req.user,
    password: req.body.password,
  });

  res.status(200).json({
    success: true,
    message: 'Password regenerated',
    data: { password: nextPassword },
  });
});

export const viewPassword = asyncHandler(async (req, res) => {
  const plaintext = await staffService.viewPassword({ userId: req.params.userId, actor: req.user });
  res.status(200).json({
    success: true,
    data: { password: plaintext },
  });
});

