import Transfer from '../models/Transfer.js';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Branch from '../models/Branch.js';
import {
  PRODUCT_HISTORY_ACTION,
  PRODUCT_UNIT_STATUS,
  ROLES,
  TRANSFER_ITEM_STATUS,
  TRANSFER_STATUS,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import { generateTransferNumber } from '../utils/transferNumber.js';
import { assertTransferTransition } from '../utils/transferConstants.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';
import { logProductHistory } from './productHistoryService.js';
import { notifyTransferEvent } from './notificationService.js';
import { resolveUnitFromScan } from './qrScanService.js';

const TRANSFER_POPULATE = [
  { path: 'fromBranch', select: 'name code' },
  { path: 'toBranch', select: 'name code' },
  { path: 'requestedBy', select: 'name email' },
  { path: 'approvedBy', select: 'name email' },
  { path: 'dispatchedBy', select: 'name email' },
  { path: 'deliveredBy', select: 'name email' },
  {
    path: 'items.productUnit',
    select: 'serialNumber status qrPayload branch',
  },
  { path: 'items.product', select: 'name sku' },
  { path: 'items.dispatchedBy', select: 'name email' },
  { path: 'items.deliveredBy', select: 'name email' },
];

const formatTransfer = (doc) => doc.toPublicJSON();

export const assertTransferAccess = (transfer, actor, { requireFrom = false, requireTo = false } = {}) => {
  if (actor.role === ROLES.SUPER_ADMIN) return;

  const actorBranch = actor.branch?.toString();
  const fromId = transfer.fromBranch?._id?.toString() || transfer.fromBranch?.toString();
  const toId = transfer.toBranch?._id?.toString() || transfer.toBranch?.toString();

  if (requireFrom && actorBranch !== fromId) {
    throw new AppError('You do not have access to this transfer at the source branch', 403);
  }
  if (requireTo && actorBranch !== toId) {
    throw new AppError('You do not have access to this transfer at the destination branch', 403);
  }
  if (!requireFrom && !requireTo && actorBranch !== fromId && actorBranch !== toId) {
    throw new AppError('You do not have access to this transfer', 403);
  }
};

const buildTransferFilter = (actor, query = {}) => {
  const filter = {};

  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE || actor.role === ROLES.DELIVERY_STAFF) {
    if (!actor.branch) throw new AppError('No branch assigned to your account', 403);
    if (query.direction === 'incoming') {
      filter.toBranch = actor.branch;
    } else if (query.direction === 'outgoing') {
      filter.fromBranch = actor.branch;
    } else {
      filter.$or = [{ fromBranch: actor.branch }, { toBranch: actor.branch }];
    }
  } else if (query.branch) {
    filter.$or = [{ fromBranch: query.branch }, { toBranch: query.branch }];
  }

  if (query.status) filter.status = query.status;
  if (query.fromBranch) filter.fromBranch = query.fromBranch;
  if (query.toBranch) filter.toBranch = query.toBranch;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.transferNumber = regex;
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

const resolveDestinationProduct = async (sourceProductId, toBranchId) => {
  const sourceProduct = await Product.findById(sourceProductId);
  if (!sourceProduct) throw new AppError('Source product not found', 404);

  const destProduct = await Product.findOne({
    branch: toBranchId,
    sku: sourceProduct.sku,
    status: { $ne: 'discontinued' },
  });

  if (!destProduct) {
    throw new AppError(
      `No product with SKU "${sourceProduct.sku}" exists at the destination branch. Add the catalog item first.`,
      400,
    );
  }

  return destProduct;
};

const validateTransferUnits = async (unitIds, fromBranchId) => {
  const units = await ProductUnit.find({ _id: { $in: unitIds } }).populate('product', 'name sku branch');

  if (units.length !== unitIds.length) {
    throw new AppError('One or more units not found', 404);
  }

  for (const unit of units) {
    const unitBranch = unit.branch?.toString() || unit.branch;
    if (unitBranch !== fromBranchId.toString()) {
      throw new AppError(`Unit ${unit.serialNumber} is not at the source branch`, 400);
    }
    if (unit.status !== PRODUCT_UNIT_STATUS.AVAILABLE) {
      throw new AppError(`Unit ${unit.serialNumber} is ${unit.status} and cannot be transferred`, 400);
    }
    if (unit.currentRental) {
      throw new AppError(`Unit ${unit.serialNumber} is on an active rental`, 400);
    }
  }

  return units;
};

export const getTransferStats = async (actor, query = {}) => {
  const filter = buildTransferFilter(actor, query);

  const [statusCounts, total] = await Promise.all([
    Transfer.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Transfer.countDocuments(filter),
  ]);

  const byStatus = Object.values(TRANSFER_STATUS).reduce((a, s) => ({ ...a, [s]: 0 }), {});
  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return { total, byStatus };
};

export const listTransfers = async (query, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  const filter = buildTransferFilter(actor, query);

  const [transfers, total] = await Promise.all([
    Transfer.find(filter).populate(TRANSFER_POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transfer.countDocuments(filter),
  ]);

  return {
    transfers: transfers.map(formatTransfer),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getTransferById = async (id, actor) => {
  const transfer = await Transfer.findById(id).populate(TRANSFER_POPULATE);
  if (!transfer) throw new AppError('Transfer not found', 404);
  assertTransferAccess(transfer, actor);
  return formatTransfer(transfer);
};

export const createTransfer = async (payload, actor) => {
  const fromBranchId =
    actor.role === ROLES.SUPER_ADMIN ? payload.fromBranch : actor.branch;
  if (!fromBranchId) throw new AppError('Source branch is required', 400);

  const toBranch = await Branch.findById(payload.toBranch);
  if (!toBranch) throw new AppError('Destination branch not found', 404);

  if (fromBranchId.toString() === payload.toBranch.toString()) {
    throw new AppError('Source and destination branches must differ', 400);
  }

  const unitIds = payload.items.map((i) => i.productUnit);
  const units = await validateTransferUnits(unitIds, fromBranchId);

  const fromBranch = await Branch.findById(fromBranchId);
  const transferNumber = await generateTransferNumber(fromBranch?.code);

  const transfer = await Transfer.create({
    transferNumber,
    fromBranch: fromBranchId,
    toBranch: payload.toBranch,
    status: TRANSFER_STATUS.PENDING,
    items: units.map((unit) => ({
      productUnit: unit._id,
      product: unit.product._id || unit.product,
      itemStatus: TRANSFER_ITEM_STATUS.PENDING,
      notes: payload.items.find(
        (i) => (i.productUnit?.toString?.() || i.productUnit) === unit._id.toString(),
      )?.notes,
    })),
    requestedBy: actor._id,
    notes: payload.notes?.trim(),
    trackingNotes: payload.trackingNotes?.trim(),
  });

  await transfer.populate(TRANSFER_POPULATE);

  await notifyTransferEvent({
    transfer,
    title: 'New transfer request',
    body: `${transfer.transferNumber}: ${fromBranch.name} → ${toBranch.name} (${units.length} units)`,
    notifyToBranch: true,
  });

  return formatTransfer(transfer);
};

export const updateTransfer = async (id, payload, actor) => {
  const transfer = await Transfer.findById(id).populate(TRANSFER_POPULATE);
  if (!transfer) throw new AppError('Transfer not found', 404);
  assertTransferAccess(transfer, actor, { requireFrom: true });

  if (transfer.status !== TRANSFER_STATUS.PENDING) {
    throw new AppError('Only pending transfers can be updated', 400);
  }

  if (payload.notes !== undefined) transfer.notes = payload.notes?.trim();
  if (payload.trackingNotes !== undefined) transfer.trackingNotes = payload.trackingNotes?.trim();

  await transfer.save();
  await transfer.populate(TRANSFER_POPULATE);
  return formatTransfer(transfer);
};

export const approveTransfer = async (id, actor) => {
  const transfer = await Transfer.findById(id).populate(TRANSFER_POPULATE);
  if (!transfer) throw new AppError('Transfer not found', 404);

  if (actor.role !== ROLES.SUPER_ADMIN) {
    assertTransferAccess(transfer, actor, { requireTo: true });
  }

  assertTransferTransition(transfer.status, TRANSFER_STATUS.APPROVED);

  transfer.status = TRANSFER_STATUS.APPROVED;
  transfer.approvedBy = actor._id;
  transfer.approvedAt = new Date();
  await transfer.save();

  await notifyTransferEvent({
    transfer,
    title: 'Transfer approved',
    body: `${transfer.transferNumber} approved — ready for dispatch scanning`,
    notifyFromBranch: true,
  });

  return formatTransfer(transfer);
};

export const cancelTransfer = async (id, actor, { reason } = {}) => {
  const transfer = await Transfer.findById(id).populate(TRANSFER_POPULATE);
  if (!transfer) throw new AppError('Transfer not found', 404);

  if (![TRANSFER_STATUS.PENDING, TRANSFER_STATUS.APPROVED].includes(transfer.status)) {
    throw new AppError('Only pending or approved transfers can be cancelled', 400);
  }

  if (actor.role !== ROLES.SUPER_ADMIN) {
    const actorBranch = actor.branch?.toString();
    const fromId = transfer.fromBranch?._id?.toString() || transfer.fromBranch?.toString();
    const toId = transfer.toBranch?._id?.toString() || transfer.toBranch?.toString();
    if (actorBranch !== fromId && actorBranch !== toId) {
      throw new AppError('You cannot cancel this transfer', 403);
    }
  }

  assertTransferTransition(transfer.status, TRANSFER_STATUS.CANCELLED);

  transfer.status = TRANSFER_STATUS.CANCELLED;
  if (reason) transfer.trackingNotes = [transfer.trackingNotes, `Cancelled: ${reason}`].filter(Boolean).join('\n');
  await transfer.save();

  await notifyTransferEvent({
    transfer,
    title: 'Transfer cancelled',
    body: `${transfer.transferNumber} was cancelled`,
    notifyFromBranch: true,
    notifyToBranch: true,
  });

  return formatTransfer(transfer);
};

const findTransferItemForUnit = (transfer, unitId) =>
  transfer.items.find(
    (item) =>
      (item.productUnit?._id?.toString() || item.productUnit?.toString()) === unitId.toString(),
  );

export const dispatchScan = async (transferId, scannedValue, actor, { notes, location } = {}) => {
  const transfer = await Transfer.findById(transferId).populate(TRANSFER_POPULATE);
  if (!transfer) throw new AppError('Transfer not found', 404);

  if (![TRANSFER_STATUS.APPROVED, TRANSFER_STATUS.IN_TRANSIT].includes(transfer.status)) {
    throw new AppError('Transfer must be approved before dispatch scanning', 400);
  }

  if (actor.role !== ROLES.SUPER_ADMIN) {
    assertTransferAccess(transfer, actor, { requireFrom: true });
  }

  const unit = await resolveUnitFromScan(scannedValue, actor);
  const item = findTransferItemForUnit(transfer, unit._id);
  if (!item) throw new AppError('This unit is not on the transfer manifest', 400);
  if (item.itemStatus !== TRANSFER_ITEM_STATUS.PENDING) {
    throw new AppError('Unit already dispatched on this transfer', 400);
  }

  if (unit.status !== PRODUCT_UNIT_STATUS.AVAILABLE) {
    throw new AppError(`Unit must be available to dispatch (current: ${unit.status})`, 400);
  }

  unit.status = PRODUCT_UNIT_STATUS.IN_TRANSFER;
  if (notes) unit.notes = notes;
  await unit.save();

  item.itemStatus = TRANSFER_ITEM_STATUS.DISPATCHED;
  item.dispatchedAt = new Date();
  item.dispatchedBy = actor._id;
  if (notes) item.notes = notes;

  const allDispatched = transfer.items.every((i) => i.itemStatus !== TRANSFER_ITEM_STATUS.PENDING);
  if (allDispatched && transfer.status === TRANSFER_STATUS.APPROVED) {
    assertTransferTransition(transfer.status, TRANSFER_STATUS.IN_TRANSIT);
    transfer.status = TRANSFER_STATUS.IN_TRANSIT;
    transfer.dispatchedAt = new Date();
    transfer.dispatchedBy = actor._id;
  }

  await transfer.save();
  await syncProductUnitCounts(unit.product?._id || unit.product);

  await logProductHistory({
    product: unit.product?._id || unit.product,
    productUnit: unit._id,
    branch: unit.branch?._id || unit.branch,
    action: PRODUCT_HISTORY_ACTION.TRANSFER_DISPATCHED,
    summary: `Dispatched on transfer ${transfer.transferNumber}`,
    metadata: { transferId: transfer._id, transferNumber: transfer.transferNumber },
    performedBy: actor._id,
  });

  await transfer.populate(TRANSFER_POPULATE);

  if (transfer.status === TRANSFER_STATUS.IN_TRANSIT) {
    await notifyTransferEvent({
      transfer,
      title: 'Transfer in transit',
      body: `${transfer.transferNumber} — all units dispatched`,
      notifyToBranch: true,
    });
  }

  return {
    transfer: formatTransfer(transfer),
    unit: unit.toPublicJSON(),
    itemId: item._id,
  };
};

export const deliveryScan = async (transferId, scannedValue, actor, { notes, location } = {}) => {
  const transfer = await Transfer.findById(transferId).populate(TRANSFER_POPULATE);
  if (!transfer) throw new AppError('Transfer not found', 404);

  if (transfer.status !== TRANSFER_STATUS.IN_TRANSIT) {
    throw new AppError('Transfer must be in transit for delivery scanning', 400);
  }

  if (actor.role !== ROLES.SUPER_ADMIN) {
    assertTransferAccess(transfer, actor, { requireTo: true });
  }

  const unit = await resolveUnitFromScan(scannedValue, actor);
  const item = findTransferItemForUnit(transfer, unit._id);
  if (!item) throw new AppError('This unit is not on the transfer manifest', 400);
  if (item.itemStatus !== TRANSFER_ITEM_STATUS.DISPATCHED) {
    throw new AppError('Unit must be dispatched before delivery scan', 400);
  }

  const toBranchId = transfer.toBranch?._id || transfer.toBranch;
  const sourceProductId = unit.product?._id || unit.product;
  const destProduct = await resolveDestinationProduct(sourceProductId, toBranchId);

  const beforeBranch = unit.branch?.toString() || unit.branch;
  unit.branch = toBranchId;
  unit.product = destProduct._id;
  unit.status = PRODUCT_UNIT_STATUS.AVAILABLE;
  unit.currentRental = null;
  if (notes) unit.notes = notes;

  if (location && typeof location === 'object') {
    unit.location = {
      aisle: location.aisle?.trim() || unit.location?.aisle,
      shelf: location.shelf?.trim() || unit.location?.shelf,
      bin: location.bin?.trim() || unit.location?.bin,
      notes: location.notes?.trim() || unit.location?.notes,
    };
    item.location = unit.location;
  }

  await unit.save();

  item.itemStatus = TRANSFER_ITEM_STATUS.DELIVERED;
  item.deliveredAt = new Date();
  item.deliveredBy = actor._id;

  const allDelivered = transfer.items.every((i) => i.itemStatus === TRANSFER_ITEM_STATUS.DELIVERED);
  if (allDelivered) {
    assertTransferTransition(transfer.status, TRANSFER_STATUS.DELIVERED);
    transfer.status = TRANSFER_STATUS.DELIVERED;
    transfer.deliveredAt = new Date();
    transfer.deliveredBy = actor._id;
  }

  await transfer.save();
  await syncProductUnitCounts(destProduct._id);
  await syncProductUnitCounts(sourceProductId);

  await logProductHistory({
    product: destProduct._id,
    productUnit: unit._id,
    branch: toBranchId,
    action: PRODUCT_HISTORY_ACTION.TRANSFER_DELIVERED,
    summary: `Delivered on transfer ${transfer.transferNumber}`,
    changes: { branch: { from: beforeBranch, to: toBranchId.toString() } },
    metadata: { transferId: transfer._id, transferNumber: transfer.transferNumber },
    performedBy: actor._id,
  });

  await transfer.populate(TRANSFER_POPULATE);

  if (transfer.status === TRANSFER_STATUS.DELIVERED) {
    await notifyTransferEvent({
      transfer,
      title: 'Transfer delivered',
      body: `${transfer.transferNumber} — all units received at destination`,
      notifyFromBranch: true,
      notifyToBranch: true,
    });
  }

  return {
    transfer: formatTransfer(transfer),
    unit: unit.toPublicJSON(),
    itemId: item._id,
  };
};
