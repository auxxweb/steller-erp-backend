import asyncHandler from '../utils/asyncHandler.js';
import * as productService from '../services/productService.js';
import * as productUnitService from '../services/productUnitService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const inventoryStats = asyncHandler(async (req, res) => {
  const stats = await productService.getInventoryStats(req.user, req.query);

  res.status(200).json({ success: true, data: { stats } });
});

export const branchInventory = asyncHandler(async (req, res) => {
  const data = await productUnitService.listBranchInventory(req.user, req.query);

  res.status(200).json({ success: true, data });
});

export const list = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query, req.user);

  res.status(200).json({
    success: true,
    count: result.products.length,
    data: result,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id, req.user);

  res.status(200).json({
    success: true,
    data: { product: product.toPublicJSON() },
  });
});

export const getAvailability = asyncHandler(async (req, res) => {
  const data = await productService.getProductAvailability(req.params.id, req.user);

  res.status(200).json({ success: true, data });
});

export const getHistory = asyncHandler(async (req, res) => {
  const data = await productService.getProductHistory(req.params.id, req.user, req.query);

  res.status(200).json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Product',
    entityId: product._id,
    summary: `Created product ${product.sku}`,
  });

  const message =
    product._unitsCreated > 0
      ? `Product created with ${product._unitsCreated} serial unit(s)`
      : 'Product created successfully';

  res.status(201).json({
    success: true,
    message,
    data: {
      product: product.toPublicJSON(),
      unitsCreated: product._unitsCreated || 0,
    },
  });
});

export const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body, req.user);

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: { product: product.toPublicJSON() },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await productService.deleteProduct(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

export const listUnits = asyncHandler(async (req, res) => {
  const result = await productUnitService.listUnitsForProduct(
    req.params.productId,
    req.user,
    req.query,
  );

  res.status(200).json({
    success: true,
    count: result.units.length,
    data: result,
  });
});

export const createUnit = asyncHandler(async (req, res) => {
  const unit = await productUnitService.createUnit(req.params.productId, req.body, req.user);

  res.status(201).json({
    success: true,
    message: 'Product unit created with QR code',
    data: { unit: unit.toPublicJSON() },
  });
});

export const createUnitsBulk = asyncHandler(async (req, res) => {
  const result = await productUnitService.createUnitsBulk(
    req.params.productId,
    req.body.units,
    req.user,
  );

  res.status(201).json({
    success: true,
    message: `${result.count} unit(s) created`,
    data: result,
  });
});

export const lookupUnit = asyncHandler(async (req, res) => {
  const unit = await productUnitService.lookupUnit(
    {
      unitId: req.query.unitId,
      serialNumber: req.query.serialNumber,
      qrPayload: req.query.qrPayload,
    },
    req.user,
  );

  res.status(200).json({
    success: true,
    data: { unit: unit.toPublicJSON() },
  });
});

export const getUnit = asyncHandler(async (req, res) => {
  const unit = await productUnitService.getUnitById(req.params.unitId, req.user);

  res.status(200).json({
    success: true,
    data: { unit: unit.toPublicJSON() },
  });
});

export const updateUnit = asyncHandler(async (req, res) => {
  const unit = await productUnitService.updateUnit(req.params.unitId, req.body, req.user);

  res.status(200).json({
    success: true,
    message: 'Unit updated successfully',
    data: { unit: unit.toPublicJSON() },
  });
});

export const updateUnitStatus = asyncHandler(async (req, res) => {
  const unit = await productUnitService.updateUnitStatus(
    req.params.unitId,
    req.body.status,
    req.user,
    req.body.notes,
  );

  res.status(200).json({
    success: true,
    message: 'Unit status updated',
    data: { unit: unit.toPublicJSON() },
  });
});

export const updateUnitLocation = asyncHandler(async (req, res) => {
  const unit = await productUnitService.updateUnitLocation(
    req.params.unitId,
    req.body.location,
    req.user,
  );

  res.status(200).json({
    success: true,
    message: 'Unit location updated',
    data: { unit: unit.toPublicJSON() },
  });
});

export const getUnitQr = asyncHandler(async (req, res) => {
  const qr = await productUnitService.getUnitQr(req.params.unitId, req.user);

  res.status(200).json({ success: true, data: { qr } });
});

export const regenerateUnitQr = asyncHandler(async (req, res) => {
  const qr = await productUnitService.regenerateUnitQr(req.params.unitId, req.user);

  res.status(200).json({
    success: true,
    message: 'QR code regenerated',
    data: { qr },
  });
});

export const getUnitHistory = asyncHandler(async (req, res) => {
  const data = await productUnitService.getUnitHistory(req.params.unitId, req.user, req.query);

  res.status(200).json({ success: true, data });
});

export const removeUnit = asyncHandler(async (req, res) => {
  const result = await productUnitService.deleteUnit(req.params.unitId, req.user);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});
