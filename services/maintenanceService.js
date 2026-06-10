import Maintenance from '../models/Maintenance.js';
import ProductUnit from '../models/ProductUnit.js';
import {
  MAINTENANCE_STATUS,
  PRODUCT_UNIT_STATUS,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { generateDocumentNumber } from '../utils/documentNumber.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';
import { logProductHistory } from './productHistoryService.js';
import { PRODUCT_HISTORY_ACTION } from '../models/constants/enums.js';
import { recordAudit } from './auditService.js';
import { notifyMaintenanceEvent } from './workflow/workflowNotificationService.js';
import { runWorkflowTransaction } from './workflow/runTransaction.js';

const POPULATE = [
  { path: 'productUnit', select: 'serialNumber status condition' },
  { path: 'product', select: 'name sku' },
  { path: 'branch', select: 'name code' },
  { path: 'reportedBy', select: 'name email' },
  { path: 'assignedTo', select: 'name email' },
];

const assertBranch = (actor, branchId) => {
  if (actor.role === ROLES.SUPER_ADMIN) return;
  if (actor.branch?.toString() !== branchId?.toString()) {
    throw new AppError('Branch access denied', 403);
  }
};

export const listMaintenance = async (actor, query = {}) => {
  const filter = {};
  if (actor.role !== ROLES.SUPER_ADMIN) filter.branch = actor.branch;
  else if (query.branch) filter.branch = query.branch;
  if (query.status) filter.status = query.status;
  if (query.productUnit) filter.productUnit = query.productUnit;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    Maintenance.find(filter).populate(POPULATE).sort({ scheduledAt: -1 }).skip(skip).limit(limit),
    Maintenance.countDocuments(filter),
  ]);

  return {
    maintenance: records.map((r) => r.toObject()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getMaintenanceById = async (id, actor) => {
  const record = await Maintenance.findById(id).populate(POPULATE);
  if (!record) throw new AppError('Maintenance record not found', 404);
  assertBranch(actor, record.branch?._id || record.branch);
  return record;
};

export const createMaintenanceTicket = async (payload, actor) => {
  const unit = await ProductUnit.findById(payload.productUnit).populate('product');
  if (!unit) throw new AppError('Product unit not found', 404);

  const branchId = payload.branch || unit.branch;
  assertBranch(actor, branchId);

  if (
    [PRODUCT_UNIT_STATUS.RENTED, PRODUCT_UNIT_STATUS.RESERVED, PRODUCT_UNIT_STATUS.IN_TRANSFER].includes(
      unit.status,
    )
  ) {
    throw new AppError(`Cannot open maintenance while unit is ${unit.status}`, 409);
  }

  return runWorkflowTransaction(async (session) => {
    const opts = session ? { session } : {};
    const maintenanceNumber = await generateDocumentNumber(
      Maintenance,
      'maintenanceNumber',
      'MNT',
    );

    const [record] = await Maintenance.create(
      [
        {
          maintenanceNumber,
          branch: branchId,
          productUnit: unit._id,
          product: unit.product._id || unit.product,
          type: payload.type,
          title: payload.title?.trim() || `Maintenance — ${unit.serialNumber}`,
          description: payload.description?.trim(),
          scheduledAt: payload.scheduledAt || new Date(),
          estimatedCost: payload.estimatedCost || 0,
          vendor: payload.vendor?.trim(),
          reportedBy: actor._id,
          assignedTo: payload.assignedTo || null,
          status: MAINTENANCE_STATUS.SCHEDULED,
        },
      ],
      opts,
    );

    unit.status = PRODUCT_UNIT_STATUS.MAINTENANCE;
    await unit.save(opts);
    await syncProductUnitCounts(unit.product._id || unit.product);

    await logProductHistory({
      product: unit.product._id || unit.product,
      productUnit: unit._id,
      branch: branchId,
      action: PRODUCT_HISTORY_ACTION.QR_MAINTENANCE,
      summary: `Maintenance ticket ${maintenanceNumber} opened`,
      performedBy: actor._id,
    });

    await notifyMaintenanceEvent({
      branchId,
      title: 'Maintenance ticket created',
      body: `${record.title} for ${unit.serialNumber}`,
      data: { maintenanceId: record._id.toString() },
    });

    await record.populate(POPULATE);
    return record;
  });
};

export const startMaintenance = async (id, actor, payload = {}) => {
  const record = await getMaintenanceById(id, actor);
  if (record.status !== MAINTENANCE_STATUS.SCHEDULED) {
    throw new AppError('Only scheduled tickets can be started', 400);
  }
  record.status = MAINTENANCE_STATUS.IN_PROGRESS;
  record.startedAt = new Date();
  if (payload.assignedTo) record.assignedTo = payload.assignedTo;
  await record.save();
  await record.populate(POPULATE);
  return record;
};

export const completeMaintenance = async (id, actor, payload = {}) => {
  const record = await getMaintenanceById(id, actor);
  if (record.status !== MAINTENANCE_STATUS.IN_PROGRESS) {
    throw new AppError('Maintenance must be in progress to complete', 400);
  }

  return runWorkflowTransaction(async (session) => {
    const opts = session ? { session } : {};
    record.status = MAINTENANCE_STATUS.COMPLETED;
    record.completedAt = new Date();
    record.actualCost = payload.actualCost ?? record.actualCost;
    if (payload.notes) record.notes = payload.notes.trim();
    await record.save(opts);

    const unit = await ProductUnit.findById(record.productUnit).session(session || null);
    if (unit) {
      unit.status = PRODUCT_UNIT_STATUS.AVAILABLE;
      if (payload.condition) unit.condition = payload.condition;
      await unit.save(opts);
      await syncProductUnitCounts(unit.product);
    }

    await record.populate(POPULATE);
    return record;
  });
};

export const cancelMaintenance = async (id, actor, reason) => {
  const record = await getMaintenanceById(id, actor);
  if ([MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELLED].includes(record.status)) {
    throw new AppError('Cannot cancel this maintenance record', 400);
  }

  record.status = MAINTENANCE_STATUS.CANCELLED;
  record.notes = reason ? `${record.notes || ''}\nCancelled: ${reason}`.trim() : record.notes;
  await record.save();

  const unit = await ProductUnit.findById(record.productUnit);
  if (unit?.status === PRODUCT_UNIT_STATUS.MAINTENANCE) {
    unit.status = PRODUCT_UNIT_STATUS.AVAILABLE;
    await unit.save();
    await syncProductUnitCounts(unit.product);
  }

  return record;
};
