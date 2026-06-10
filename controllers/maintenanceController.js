import asyncHandler from '../utils/asyncHandler.js';
import * as maintenanceService from '../services/maintenanceService.js';
import { recordAudit } from '../services/auditService.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const list = asyncHandler(async (req, res) => {
  const data = await maintenanceService.listMaintenance(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const getOne = asyncHandler(async (req, res) => {
  const record = await maintenanceService.getMaintenanceById(req.params.id, req.user);
  res.status(200).json({ success: true, data: { maintenance: record } });
});

export const create = asyncHandler(async (req, res) => {
  const record = await maintenanceService.createMaintenanceTicket(req.body, req.user);
  await recordAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Maintenance',
    entityId: record._id,
    summary: `Maintenance ticket ${record.maintenanceNumber}`,
  });
  res.status(201).json({ success: true, message: 'Maintenance ticket created', data: { maintenance: record } });
});

export const start = asyncHandler(async (req, res) => {
  const record = await maintenanceService.startMaintenance(req.params.id, req.user, req.body);
  res.status(200).json({ success: true, data: { maintenance: record } });
});

export const complete = asyncHandler(async (req, res) => {
  const record = await maintenanceService.completeMaintenance(req.params.id, req.user, req.body);
  res.status(200).json({ success: true, data: { maintenance: record } });
});

export const cancel = asyncHandler(async (req, res) => {
  const record = await maintenanceService.cancelMaintenance(req.params.id, req.user, req.body.reason);
  res.status(200).json({ success: true, data: { maintenance: record } });
});
