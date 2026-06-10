import asyncHandler from '../utils/asyncHandler.js';
import * as qrScanService from '../services/qrScanService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

const getScannedValue = (body) =>
  body.scannedValue?.trim() || body.qrPayload?.trim() || body.unitId;

export const verify = asyncHandler(async (req, res) => {
  const result = await qrScanService.verifyQrScan(getScannedValue(req.body), req.user);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const scan = asyncHandler(async (req, res) => {
  const result = await qrScanService.executeQrScan(
    getScannedValue(req.body),
    req.body.action,
    req.user,
    {
      notes: req.body.notes,
      toBranchId: req.body.toBranchId,
    },
  );

  await logAudit({
    ...auditMeta(req),
    action: 'update',
    entity: 'ProductUnit',
    entityId: result.unit.id,
    summary: `QR ${req.body.action} on ${result.unit.serialNumber}`,
    metadata: { scanAction: req.body.action },
  });

  res.status(200).json({
    success: true,
    message: `${req.body.action} completed successfully`,
    data: result,
  });
});

export const lookup = asyncHandler(async (req, res) => {
  const result = await qrScanService.verifyQrScan(
    req.query.scannedValue || req.query.qrPayload || req.query.unitId,
    req.user,
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const ensureQr = asyncHandler(async (req, res) => {
  const qr = await qrScanService.ensureUnitQr(req.params.unitId, req.user);

  res.status(200).json({
    success: true,
    data: { qr },
  });
});
