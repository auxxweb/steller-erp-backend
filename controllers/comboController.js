import asyncHandler from '../utils/asyncHandler.js';
import * as comboService from '../services/comboService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const stats = asyncHandler(async (req, res) => {
  const stats = await comboService.getComboStats(req.user, req.query);
  res.status(200).json({ success: true, data: { stats } });
});

export const list = asyncHandler(async (req, res) => {
  const result = await comboService.listCombos(req.query, req.user);
  res.status(200).json({
    success: true,
    count: result.combos.length,
    data: result,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const combo = await comboService.getComboById(req.params.id, req.user);
  res.status(200).json({
    success: true,
    data: { combo: combo.toPublicJSON() },
  });
});

export const calculatePrice = asyncHandler(async (req, res) => {
  const data = await comboService.calculateComboPrice(req.params.id, req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const checkAvailability = asyncHandler(async (req, res) => {
  const data = await comboService.checkComboAvailability(req.params.id, req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const preview = asyncHandler(async (req, res) => {
  const data = await comboService.previewCombo(req.body, req.user);
  res.status(200).json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const combo = await comboService.createCombo(req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Combo',
    entityId: combo._id,
    summary: `Created combo ${combo.name}`,
  });

  res.status(201).json({
    success: true,
    message: 'Combo created successfully',
    data: { combo: combo.toPublicJSON() },
  });
});

export const update = asyncHandler(async (req, res) => {
  const combo = await comboService.updateCombo(req.params.id, req.body, req.user);

  res.status(200).json({
    success: true,
    message: 'Combo updated successfully',
    data: { combo: combo.toPublicJSON() },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await comboService.deleteCombo(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});
