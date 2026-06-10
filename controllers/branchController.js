import asyncHandler from '../utils/asyncHandler.js';
import * as branchService from '../services/branchService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await branchService.getBranchStats();

  res.status(200).json({
    success: true,
    data: { stats },
  });
});

export const list = asyncHandler(async (req, res) => {
  const result = await branchService.listBranches(req.query, req.user);

  res.status(200).json({
    success: true,
    count: result.branches.length,
    data: result,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const branch = await branchService.getBranchById(req.params.id, req.user);

  res.status(200).json({
    success: true,
    data: { branch: branch.toPublicJSON() },
  });
});

export const getMine = asyncHandler(async (req, res) => {
  const branch = await branchService.getMyBranch(req.user);

  res.status(200).json({
    success: true,
    data: { branch: branch.toPublicJSON() },
  });
});

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await branchService.getBranchDashboard(req.params.id, req.user);

  res.status(200).json({
    success: true,
    data,
  });
});

export const create = asyncHandler(async (req, res) => {
  const branch = await branchService.createBranch(req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Branch',
    entityId: branch._id,
    summary: `Created branch ${branch.code}`,
    changes: { after: branch.toPublicJSON() },
  });

  res.status(201).json({
    success: true,
    message: 'Branch created successfully',
    data: { branch: branch.toPublicJSON() },
  });
});

export const update = asyncHandler(async (req, res) => {
  const before = await branchService.getBranchById(req.params.id, req.user);
  const branch = await branchService.updateBranch(req.params.id, req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'update',
    entity: 'Branch',
    entityId: branch._id,
    summary: `Updated branch ${branch.code}`,
    changes: { before: before.toPublicJSON(), after: branch.toPublicJSON() },
  });

  res.status(200).json({
    success: true,
    message: 'Branch updated successfully',
    data: { branch: branch.toPublicJSON() },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await branchService.deleteBranch(req.params.id, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'delete',
    entity: 'Branch',
    entityId: req.params.id,
    summary: result.softDeleted
      ? `Closed branch ${result.branch.code}`
      : `Deleted branch ${result.branch.code}`,
  });

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

export const listManagers = asyncHandler(async (_req, res) => {
  const managers = await branchService.listBranchManagers();

  res.status(200).json({
    success: true,
    count: managers.length,
    data: { managers },
  });
});
