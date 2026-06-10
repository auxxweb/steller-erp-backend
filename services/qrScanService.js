import ProductUnit from '../models/ProductUnit.js';
import Branch from '../models/Branch.js';
import {
  PRODUCT_HISTORY_ACTION,
  PRODUCT_UNIT_STATUS,
  QR_SCAN_ACTION,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { parseQrPayload } from '../utils/parseQrPayload.js';
import { buildUnitQrPayload, generateUnitQr } from '../utils/qrcode.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';
import { logProductHistory } from './productHistoryService.js';
import { lookupUnit, getUnitById } from './productUnitService.js';

const UNIT_POPULATE = [
  { path: 'product', select: 'name sku specs status images' },
  { path: 'branch', select: 'name code' },
];

const ACTION_LABELS = {
  [QR_SCAN_ACTION.PICKUP]: 'Pickup (checkout)',
  [QR_SCAN_ACTION.RETURN]: 'Return (check-in)',
  [QR_SCAN_ACTION.TRANSFER]: 'Transfer out',
  [QR_SCAN_ACTION.MAINTENANCE]: 'Send to maintenance',
};

const formatUnit = (doc) => doc.toPublicJSON();

/**
 * Resolve allowed QR actions for current unit state.
 */
export const getAllowedActions = (unit) => {
  const status = unit.status;
  const actions = [];

  const add = (action, enabled, reason = null) => {
    actions.push({
      action,
      label: ACTION_LABELS[action],
      enabled,
      reason,
    });
  };

  if ([PRODUCT_UNIT_STATUS.AVAILABLE, PRODUCT_UNIT_STATUS.RESERVED].includes(status)) {
    add(QR_SCAN_ACTION.PICKUP, true);
  } else {
    add(QR_SCAN_ACTION.PICKUP, false, `Unit is ${status}, not available for pickup`);
  }

  if (status === PRODUCT_UNIT_STATUS.RENTED) {
    add(QR_SCAN_ACTION.RETURN, true);
  } else {
    add(QR_SCAN_ACTION.RETURN, false, 'Unit is not currently rented');
  }

  if (status === PRODUCT_UNIT_STATUS.AVAILABLE) {
    add(QR_SCAN_ACTION.TRANSFER, true);
  } else if (status === PRODUCT_UNIT_STATUS.IN_TRANSFER) {
    add(QR_SCAN_ACTION.TRANSFER, true, 'Complete transfer — mark available at branch');
  } else {
    add(QR_SCAN_ACTION.TRANSFER, false, 'Transfer requires available or in-transfer status');
  }

  if (
    ![PRODUCT_UNIT_STATUS.RETIRED, PRODUCT_UNIT_STATUS.LOST, PRODUCT_UNIT_STATUS.RENTED].includes(
      status,
    )
  ) {
    add(QR_SCAN_ACTION.MAINTENANCE, status !== PRODUCT_UNIT_STATUS.MAINTENANCE);
    if (status === PRODUCT_UNIT_STATUS.MAINTENANCE) {
      actions[actions.length - 1].reason = 'Already in maintenance';
    }
  } else {
    add(QR_SCAN_ACTION.MAINTENANCE, false, 'Cannot send rented, lost, or retired units to maintenance');
  }

  return actions;
};

export const resolveUnitFromScan = async (scannedValue, actor) => {
  const parsed = parseQrPayload(scannedValue);
  if (parsed.error) {
    throw new AppError(parsed.error, 400);
  }

  const unit = await lookupUnit(
    {
      unitId: parsed.unitId,
      qrPayload: parsed.qrPayload,
      serialNumber: parsed.serialNumber,
    },
    actor,
  );

  return unit;
};

/**
 * Verify QR without mutating state.
 */
export const verifyQrScan = async (scannedValue, actor) => {
  const unit = await resolveUnitFromScan(scannedValue, actor);
  const allowedActions = getAllowedActions(unit);

  const expectedPayload = buildUnitQrPayload(unit);
  const payloadMatch =
    !scannedValue ||
    scannedValue.trim() === unit.qrPayload ||
    scannedValue.trim() === expectedPayload ||
    parseQrPayload(scannedValue).unitId === unit._id.toString();

  return {
    valid: true,
    verified: payloadMatch,
    unit: formatUnit(unit),
    allowedActions,
    product: unit.product,
  };
};

const applyPickup = async (unit, actor, notes) => {
  if (![PRODUCT_UNIT_STATUS.AVAILABLE, PRODUCT_UNIT_STATUS.RESERVED].includes(unit.status)) {
    throw new AppError(`Cannot pickup unit with status: ${unit.status}`, 400);
  }
  const before = unit.status;
  unit.status = PRODUCT_UNIT_STATUS.RENTED;
  if (notes) unit.notes = notes;
  await unit.save();
  return { before, after: unit.status, action: PRODUCT_HISTORY_ACTION.QR_PICKUP };
};

const applyReturn = async (unit, actor, notes) => {
  if (unit.status !== PRODUCT_UNIT_STATUS.RENTED) {
    throw new AppError('Unit is not rented — cannot return', 400);
  }
  const before = unit.status;
  unit.status = PRODUCT_UNIT_STATUS.AVAILABLE;
  unit.currentRental = null;
  if (notes) unit.notes = notes;
  await unit.save();
  return { before, after: unit.status, action: PRODUCT_HISTORY_ACTION.QR_RETURN };
};

const applyTransfer = async (unit, actor, { notes, toBranchId } = {}) => {
  if (unit.status === PRODUCT_UNIT_STATUS.AVAILABLE) {
    unit.status = PRODUCT_UNIT_STATUS.IN_TRANSFER;
    if (notes) unit.notes = notes;
    await unit.save();
    return {
      before: PRODUCT_UNIT_STATUS.AVAILABLE,
      after: unit.status,
      action: PRODUCT_HISTORY_ACTION.QR_TRANSFER,
      metadata: { phase: 'out', toBranchId },
    };
  }

  if (unit.status === PRODUCT_UNIT_STATUS.IN_TRANSFER) {
    if (toBranchId && actor.role === ROLES.SUPER_ADMIN) {
      const branch = await Branch.findById(toBranchId);
      if (!branch) throw new AppError('Target branch not found', 404);
      unit.branch = toBranchId;
    }
    unit.status = PRODUCT_UNIT_STATUS.AVAILABLE;
    if (notes) unit.notes = notes;
    await unit.save();
    return {
      before: PRODUCT_UNIT_STATUS.IN_TRANSFER,
      after: unit.status,
      action: PRODUCT_HISTORY_ACTION.QR_TRANSFER,
      metadata: { phase: 'in', branch: unit.branch },
    };
  }

  throw new AppError('Unit must be available or in-transfer for transfer action', 400);
};

const applyMaintenance = async (unit, actor, notes) => {
  if (
    [PRODUCT_UNIT_STATUS.RENTED, PRODUCT_UNIT_STATUS.RETIRED, PRODUCT_UNIT_STATUS.LOST].includes(
      unit.status,
    )
  ) {
    throw new AppError(`Cannot move ${unit.status} unit to maintenance`, 400);
  }
  if (unit.status === PRODUCT_UNIT_STATUS.MAINTENANCE) {
    throw new AppError('Unit is already in maintenance', 400);
  }
  const before = unit.status;
  unit.status = PRODUCT_UNIT_STATUS.MAINTENANCE;
  unit.lastMaintenanceAt = new Date();
  if (notes) unit.notes = notes;
  await unit.save();
  return { before, after: unit.status, action: PRODUCT_HISTORY_ACTION.QR_MAINTENANCE };
};

/**
 * Execute a QR-driven inventory action.
 */
export const executeQrScan = async (scannedValue, action, actor, options = {}) => {
  const unit = await resolveUnitFromScan(scannedValue, actor);
  const allowed = getAllowedActions(unit);
  const match = allowed.find((a) => a.action === action);

  if (!match?.enabled) {
    throw new AppError(match?.reason || `Action "${action}" is not allowed`, 400);
  }

  let result;
  switch (action) {
    case QR_SCAN_ACTION.PICKUP:
      result = await applyPickup(unit, actor, options.notes);
      break;
    case QR_SCAN_ACTION.RETURN:
      result = await applyReturn(unit, actor, options.notes);
      break;
    case QR_SCAN_ACTION.TRANSFER:
      result = await applyTransfer(unit, actor, options);
      break;
    case QR_SCAN_ACTION.MAINTENANCE:
      result = await applyMaintenance(unit, actor, options.notes);
      break;
    default:
      throw new AppError('Unknown scan action', 400);
  }

  await unit.populate(UNIT_POPULATE);
  await syncProductUnitCounts(unit.product?._id || unit.product);

  await logProductHistory({
    product: unit.product?._id || unit.product,
    productUnit: unit._id,
    branch: unit.branch?._id || unit.branch,
    action: result.action,
    summary: `QR ${action}: ${unit.serialNumber} (${result.before} → ${result.after})`,
    changes: { before: result.before, after: result.after },
    metadata: { scanAction: action, ...result.metadata },
    performedBy: actor._id,
  });

  return {
    success: true,
    action,
    unit: formatUnit(unit),
    transition: { from: result.before, to: result.after },
    allowedActions: getAllowedActions(unit),
  };
};

/**
 * Ensure unit has QR — regenerate if missing.
 */
export const ensureUnitQr = async (unitId, actor) => {
  const unit = await getUnitById(unitId, actor);
  if (unit.qrCode && unit.qrPayload) {
    return {
      unitId: unit._id,
      payload: unit.qrPayload,
      dataUrl: unit.qrCode,
      regenerated: false,
    };
  }
  const qr = await generateUnitQr(unit);
  unit.qrPayload = qr.payload;
  unit.qrCode = qr.dataUrl;
  await unit.save();
  return {
    unitId: unit._id,
    payload: qr.payload,
    dataUrl: qr.dataUrl,
    scanUrl: qr.scanUrl,
    regenerated: true,
  };
};
