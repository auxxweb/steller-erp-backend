import asyncHandler from '../utils/asyncHandler.js';
import * as qrCatalogService from '../services/qrCatalogService.js';

export const listUnits = asyncHandler(async (req, res) => {
  const result = await qrCatalogService.listCatalogUnits(req.query);
  res.status(200).json({
    success: true,
    count: result.units.length,
    data: result,
  });
});

export const getUnit = asyncHandler(async (req, res) => {
  const unit = await qrCatalogService.getCatalogUnit(req.params.unitId);
  res.status(200).json({
    success: true,
    data: { unit },
  });
});

export const downloadUnitPng = asyncHandler(async (req, res) => {
  const { buffer, filename, payload } = await qrCatalogService.getUnitQrImage(req.params.unitId);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-QR-Payload', payload);
  res.send(buffer);
});

export const downloadBulkZip = asyncHandler(async (req, res) => {
  const zipBuffer = await qrCatalogService.buildBulkQrZip(req.query);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="stellar-qr-codes-${stamp}.zip"`);
  res.send(zipBuffer);
});
