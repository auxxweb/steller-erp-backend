import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Branch from '../models/Branch.js';
import {
  PRODUCT_HISTORY_ACTION,
  PRODUCT_UNIT_STATUS,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { generateUnitQr } from '../utils/qrcode.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';
import { logProductHistory, listProductHistory } from './productHistoryService.js';
import { getProductById } from './productService.js';
import { canTransitionStatus } from '../validators/productUnitValidator.js';

const UNIT_POPULATE = [
  { path: 'product', select: 'name sku specs status' },
  { path: 'branch', select: 'name code' },
];

const formatUnit = (doc) => doc.toPublicJSON();

const assertBranchAccess = (actor, branchId) => {
  if (actor.role === ROLES.SUPER_ADMIN) return;

  if (
    (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) &&
    actor.branch?.toString() !== branchId?.toString()
  ) {
    throw new AppError('You do not have access to this branch inventory', 403);
  }
};

export const getUnitById = async (id, actor) => {
  const unit = await ProductUnit.findById(id).populate(UNIT_POPULATE);

  if (!unit) throw new AppError('Product unit not found', 404);

  return unit;
};

export const lookupUnit = async ({ serialNumber, qrPayload, unitId }, actor) => {
  let unit;

  if (unitId) {
    unit = await ProductUnit.findById(unitId).populate(UNIT_POPULATE);
  } else if (qrPayload) {
    unit = await ProductUnit.findOne({ qrPayload }).populate(UNIT_POPULATE);
  } else if (serialNumber) {
    unit = await ProductUnit.findOne({ serialNumber: serialNumber.trim() }).populate(UNIT_POPULATE);
  } else {
    throw new AppError('Provide unitId, serialNumber, or qrPayload', 400);
  }

  if (!unit) throw new AppError('Product unit not found', 404);

  return unit;
};

export const listUnitsForProduct = async (productId, actor, query = {}) => {
  await getProductById(productId, actor);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = { product: productId };
  if (query.status) filter.status = query.status;
  if (query.condition) filter.condition = query.condition;
  if (query.branch) filter.branch = query.branch;

  const [units, total] = await Promise.all([
    ProductUnit.find(filter).populate(UNIT_POPULATE).sort({ serialNumber: 1 }).skip(skip).limit(limit),
    ProductUnit.countDocuments(filter),
  ]);

  return {
    units: units.map(formatUnit),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

const createUnitRecord = async (product, payload, actor) => {
  const branchId = payload.branch || product.branch?._id || product.branch;

  // Branch on unit = current physical location; any role may record location.

  const serial = payload.serialNumber.trim();
  const duplicate = await ProductUnit.findOne({ branch: branchId, serialNumber: serial });
  if (duplicate) {
    throw new AppError(`Serial number already exists: ${serial}`, 409);
  }

  const unit = await ProductUnit.create({
    product: product._id,
    branch: branchId,
    serialNumber: serial,
    barcode: payload.barcode?.trim(),
    assetTag: payload.assetTag?.trim()?.toUpperCase(),
    status: payload.status || PRODUCT_UNIT_STATUS.AVAILABLE,
    condition: payload.condition,
    location: payload.location,
    purchaseDate: payload.purchaseDate,
    purchaseCost: payload.purchaseCost,
    warrantyExpiresAt: payload.warrantyExpiresAt,
    notes: payload.notes?.trim(),
    createdBy: actor._id,
  });

  const qr = await generateUnitQr(unit);
  unit.qrPayload = qr.payload;
  unit.qrCode = qr.dataUrl;
  await unit.save();

  await unit.populate(UNIT_POPULATE);
  await syncProductUnitCounts(product._id);

  await logProductHistory({
    product: product._id,
    productUnit: unit._id,
    branch: branchId,
    action: PRODUCT_HISTORY_ACTION.UNIT_CREATED,
    summary: `Created unit ${unit.serialNumber}`,
    changes: { after: formatUnit(unit) },
    metadata: { qrPayload: unit.qrPayload },
    performedBy: actor._id,
  });

  return unit;
};

export const createUnit = async (productId, payload, actor) => {
  const product = await getProductById(productId, actor);

  if (!product.trackUnits) {
    throw new AppError('This product does not track serial units', 400);
  }

  return createUnitRecord(product, payload, actor);
};

export const createUnitsBulk = async (productId, unitsPayload, actor) => {
  const product = await getProductById(productId, actor);

  if (!product.trackUnits) {
    throw new AppError('This product does not track serial units', 400);
  }

  const created = [];
  const failed = [];

  for (const unitPayload of unitsPayload) {
    try {
      const unit = await createUnitRecord(product, unitPayload, actor);
      created.push(formatUnit(unit));
    } catch (err) {
      failed.push({
        serialNumber: unitPayload.serialNumber,
        reason: err.message,
      });
    }
  }

  if (!created.length) {
    throw new AppError('All unit creations failed', 400, failed.map((f) => f.reason));
  }

  return { created, failed, count: created.length };
};

export const updateUnit = async (unitId, payload, actor) => {
  const unit = await getUnitById(unitId, actor);
  const before = formatUnit(unit);

  if (payload.serialNumber) {
    const serial = payload.serialNumber.trim();
    const dup = await ProductUnit.findOne({
      branch: unit.branch,
      serialNumber: serial,
      _id: { $ne: unit._id },
    });
    if (dup) throw new AppError('Serial number already exists', 409);
    unit.serialNumber = serial;
  }

  if (payload.barcode !== undefined) unit.barcode = payload.barcode?.trim();
  if (payload.assetTag !== undefined) unit.assetTag = payload.assetTag?.trim()?.toUpperCase();
  if (payload.condition !== undefined) unit.condition = payload.condition;
  if (payload.notes !== undefined) unit.notes = payload.notes?.trim();
  if (payload.location !== undefined) unit.location = payload.location;
  if (payload.purchaseDate !== undefined) unit.purchaseDate = payload.purchaseDate;
  if (payload.purchaseCost !== undefined) unit.purchaseCost = payload.purchaseCost;
  if (payload.warrantyExpiresAt !== undefined) {
    unit.warrantyExpiresAt = payload.warrantyExpiresAt;
  }

  if (payload.images !== undefined) {
    unit.images = (payload.images || []).slice(0, 2).map((img) => ({
      url: img.url,
      publicId: img.publicId,
      thumbnailUrl: img.thumbnailUrl,
      mimeType: img.mimeType,
      uploadedAt: img.uploadedAt ? new Date(img.uploadedAt) : new Date(),
    }));
  }

  let statusAction = PRODUCT_HISTORY_ACTION.UNIT_UPDATED;
  let summary = `Updated unit ${unit.serialNumber}`;

  if (payload.status !== undefined && payload.status !== unit.status) {
    if (!canTransitionStatus(unit.status, payload.status)) {
      throw new AppError(`Cannot transition from ${unit.status} to ${payload.status}`, 400);
    }
    unit.status = payload.status;
    statusAction = PRODUCT_HISTORY_ACTION.UNIT_STATUS_CHANGED;
    summary = `Unit status changed to ${unit.status}`;
  }

  if (payload.branch !== undefined && actor.role === ROLES.SUPER_ADMIN) {
    const newBranch = await Branch.findById(payload.branch);
    if (!newBranch) throw new AppError('Branch not found', 404);

    const dup = await ProductUnit.findOne({
      branch: payload.branch,
      serialNumber: unit.serialNumber,
      _id: { $ne: unit._id },
    });
    if (dup) throw new AppError('Serial exists at target branch', 409);

    unit.branch = payload.branch;
    statusAction = PRODUCT_HISTORY_ACTION.UNIT_BRANCH_CHANGED;
    summary = `Unit moved to branch ${newBranch.code}`;
  }

  if (payload.condition !== undefined && payload.condition !== before.condition) {
    statusAction = PRODUCT_HISTORY_ACTION.UNIT_CONDITION_CHANGED;
    summary = `Unit condition changed to ${unit.condition}`;
  }

  await unit.save();
  await unit.populate(UNIT_POPULATE);
  await syncProductUnitCounts(unit.product?._id || unit.product);

  await logProductHistory({
    product: unit.product?._id || unit.product,
    productUnit: unit._id,
    branch: unit.branch?._id || unit.branch,
    action: statusAction,
    summary,
    changes: { before, after: formatUnit(unit) },
    performedBy: actor._id,
  });

  return unit;
};

export const updateUnitStatus = async (unitId, status, actor, notes) => {
  return updateUnit(unitId, { status, notes }, actor);
};

export const updateUnitLocation = async (unitId, location, actor) => {
  const unit = await getUnitById(unitId, actor);
  const before = unit.location;

  unit.location = location;
  await unit.save();
  await unit.populate(UNIT_POPULATE);

  await logProductHistory({
    product: unit.product?._id || unit.product,
    productUnit: unit._id,
    branch: unit.branch?._id || unit.branch,
    action: PRODUCT_HISTORY_ACTION.UNIT_UPDATED,
    summary: `Updated storage location for ${unit.serialNumber}`,
    changes: { before, after: unit.location },
    performedBy: actor._id,
  });

  return unit;
};

export const getUnitQr = async (unitId, actor) => {
  const unit = await getUnitById(unitId, actor);

  if (unit.qrCode && unit.qrPayload) {
    return {
      unitId: unit._id,
      serialNumber: unit.serialNumber,
      payload: unit.qrPayload,
      dataUrl: unit.qrCode,
    };
  }

  const qr = await generateUnitQr(unit);
  unit.qrPayload = qr.payload;
  unit.qrCode = qr.dataUrl;
  await unit.save();

  return {
    unitId: unit._id,
    serialNumber: unit.serialNumber,
    payload: qr.payload,
    dataUrl: qr.dataUrl,
    scanUrl: qr.scanUrl,
  };
};

export const regenerateUnitQr = async (unitId, actor) => {
  const unit = await getUnitById(unitId, actor);
  const qr = await generateUnitQr(unit);
  unit.qrPayload = qr.payload;
  unit.qrCode = qr.dataUrl;
  await unit.save();

  return {
    unitId: unit._id,
    payload: qr.payload,
    dataUrl: qr.dataUrl,
    scanUrl: qr.scanUrl,
  };
};

export const getUnitHistory = async (unitId, actor, query = {}) => {
  const unit = await getUnitById(unitId, actor);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

  return listProductHistory({ productUnit: unit._id }, { page, limit });
};

export const deleteUnit = async (unitId, actor) => {
  const unit = await getUnitById(unitId, actor);

  if (unit.status === PRODUCT_UNIT_STATUS.RENTED) {
    throw new AppError('Cannot retire a unit that is currently rented', 400);
  }

  if (unit.currentRental) {
    throw new AppError('Unit has an active rental reference', 400);
  }

  unit.status = PRODUCT_UNIT_STATUS.RETIRED;
  await unit.save();
  await syncProductUnitCounts(unit.product?._id || unit.product);

  await logProductHistory({
    product: unit.product?._id || unit.product,
    productUnit: unit._id,
    branch: unit.branch?._id || unit.branch,
    action: PRODUCT_HISTORY_ACTION.UNIT_RETIRED,
    summary: `Retired unit ${unit.serialNumber}`,
    performedBy: actor._id,
  });

  return { unit: formatUnit(unit), message: 'Unit retired successfully' };
};

export const listBranchInventory = async (actor, query = {}) => {
  const branchId =
    actor.role === ROLES.SUPER_ADMIN
      ? query.branch || actor.branch
      : actor.branch;

  if (!branchId) {
    throw new AppError('branch query parameter is required', 400);
  }

  assertBranchAccess(actor, branchId);

  const filter = { branch: branchId };
  if (query.status) filter.status = query.status;

  const listLimit = Math.min(100, Number(query.limit) || 50);

  const [units, totalAtBranch, byProduct, byStatus] = await Promise.all([
    ProductUnit.find(filter)
      .populate(UNIT_POPULATE)
      .sort({ updatedAt: -1 })
      .limit(listLimit),
    ProductUnit.countDocuments(filter),
    ProductUnit.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$product',
          total: { $sum: 1 },
          available: {
            $sum: {
              $cond: [{ $eq: ['$status', PRODUCT_UNIT_STATUS.AVAILABLE] }, 1, 0],
            },
          },
        },
      },
    ]),
    ProductUnit.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const statusSummary = Object.values(PRODUCT_UNIT_STATUS).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  byStatus.forEach(({ _id, count }) => {
    if (_id) statusSummary[_id] = count;
  });

  return {
    branch: branchId,
    units: units.map(formatUnit),
    summary: {
      totalUnits: totalAtBranch,
      listed: units.length,
      byStatus: statusSummary,
      productCount: byProduct.length,
    },
  };
};
