import asyncHandler from '../utils/asyncHandler.js';
import * as transferService from '../services/transferService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

const getScannedValue = (body) =>
  body.scannedValue?.trim() || body.qrPayload?.trim() || body.unitId;

export const stats = asyncHandler(async (req, res) => {
  const stats = await transferService.getTransferStats(req.user, req.query);
  res.status(200).json({ success: true, data: { stats } });
});

export const list = asyncHandler(async (req, res) => {
  const result = await transferService.listTransfers(req.query, req.user);
  res.status(200).json({
    success: true,
    count: result.transfers.length,
    data: result,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const transfer = await transferService.getTransferById(req.params.id, req.user);
  res.status(200).json({ success: true, data: { transfer } });
});

export const create = asyncHandler(async (req, res) => {
  const transfer = await transferService.createTransfer(req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Transfer',
    entityId: transfer.id,
    summary: `Created transfer ${transfer.transferNumber}`,
  });

  res.status(201).json({
    success: true,
    message: 'Transfer request created',
    data: { transfer },
  });
});

export const update = asyncHandler(async (req, res) => {
  const transfer = await transferService.updateTransfer(req.params.id, req.body, req.user);
  res.status(200).json({
    success: true,
    message: 'Transfer updated',
    data: { transfer },
  });
});

export const approve = asyncHandler(async (req, res) => {
  const transfer = await transferService.approveTransfer(req.params.id, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'status_change',
    entity: 'Transfer',
    entityId: transfer.id,
    summary: `Approved transfer ${transfer.transferNumber}`,
  });

  res.status(200).json({
    success: true,
    message: 'Transfer approved',
    data: { transfer },
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const transfer = await transferService.cancelTransfer(req.params.id, req.user, {
    reason: req.body.reason,
  });

  await logAudit({
    ...auditMeta(req),
    action: 'status_change',
    entity: 'Transfer',
    entityId: transfer.id,
    summary: `Cancelled transfer ${transfer.transferNumber}`,
  });

  res.status(200).json({
    success: true,
    message: 'Transfer cancelled',
    data: { transfer },
  });
});

export const dispatchScan = asyncHandler(async (req, res) => {
  const result = await transferService.dispatchScan(
    req.params.id,
    getScannedValue(req.body),
    req.user,
    { notes: req.body.notes, location: req.body.location },
  );

  await logAudit({
    ...auditMeta(req),
    action: 'update',
    entity: 'Transfer',
    entityId: result.transfer.id,
    summary: `Dispatch scan on ${result.transfer.transferNumber}`,
  });

  res.status(200).json({
    success: true,
    message: 'Unit dispatched',
    data: result,
  });
});

export const deliveryScan = asyncHandler(async (req, res) => {
  const result = await transferService.deliveryScan(
    req.params.id,
    getScannedValue(req.body),
    req.user,
    { notes: req.body.notes, location: req.body.location },
  );

  await logAudit({
    ...auditMeta(req),
    action: 'update',
    entity: 'Transfer',
    entityId: result.transfer.id,
    summary: `Delivery scan on ${result.transfer.transferNumber}`,
  });

  res.status(200).json({
    success: true,
    message: 'Unit delivered',
    data: result,
  });
});
