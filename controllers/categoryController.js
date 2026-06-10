import asyncHandler from '../utils/asyncHandler.js';
import * as categoryService from '../services/categoryService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const getStats = asyncHandler(async (req, res) => {
  const stats = await categoryService.getCategoryStats(req.user, req.query);

  res.status(200).json({
    success: true,
    data: { stats },
  });
});

export const list = asyncHandler(async (req, res) => {
  const result = await categoryService.listCategories(req.query, req.user);

  res.status(200).json({
    success: true,
    count: result.categories.length,
    data: result,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id, req.user);

  res.status(200).json({
    success: true,
    data: { category: category.toPublicJSON() },
  });
});

export const create = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Category',
    entityId: category._id,
    summary: `Created category ${category.slug}`,
    changes: { after: category.toPublicJSON() },
  });

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: { category: category.toPublicJSON() },
  });
});

export const update = asyncHandler(async (req, res) => {
  const before = await categoryService.getCategoryById(req.params.id, req.user);
  const category = await categoryService.updateCategory(req.params.id, req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'update',
    entity: 'Category',
    entityId: category._id,
    summary: `Updated category ${category.slug}`,
    changes: { before: before.toPublicJSON(), after: category.toPublicJSON() },
  });

  res.status(200).json({
    success: true,
    message: 'Category updated successfully',
    data: { category: category.toPublicJSON() },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await categoryService.deleteCategory(req.params.id, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'delete',
    entity: 'Category',
    entityId: req.params.id,
    summary: result.softDeleted
      ? `Deactivated category ${result.category.slug}`
      : `Deleted category ${result.category.slug}`,
  });

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});
