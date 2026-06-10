import mongoose from 'mongoose';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import RentalItem from '../models/RentalItem.js';
import {
  PRODUCT_UNIT_STATUS,
  RENTAL_ITEM_STATUS,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import {
  findAvailableUnits,
  findBusyUnitIds,
  validateProductAvailability,
} from '../utils/rentalAvailability.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';
import {
  rentalItemHasUnit,
  resolveRefIdString,
} from '../utils/rentalInventoryHelpers.js';

/**
 * Allocate specific units to rental line items (reservation lock).
 * Branch on unit = current physical location only.
 */
export const allocateUnitsForRental = async ({
  rental,
  items,
  session = null,
  deferUnitAssignment = false,
}) => {
  const opts = session ? { session } : {};
  const startAt = rental.scheduledStartAt;
  const endAt = rental.scheduledEndAt;
  const allocated = [];

  for (const item of items) {
    const productDoc = await Product.findById(item.product).session(session || null);
    if (!productDoc) throw new AppError('Product not found for line item', 404);

    const busyIds = await findBusyUnitIds({
      startAt,
      endAt,
      excludeRentalId: rental._id,
    });

    if (deferUnitAssignment) {
      const availability = await validateProductAvailability({
        productId: resolveRefIdString(item.product),
        quantity: item.quantity,
        startAt,
        endAt,
        excludeRentalId: rental._id,
      });

      if (!availability.isAvailable) {
        throw new AppError(
          `Insufficient stock for product (${availability.availableCount} available, ${item.quantity} requested)`,
          409,
        );
      }

      item.status = RENTAL_ITEM_STATUS.RESERVED;
      await item.save(opts);
      continue;
    }

    if (item.productUnit) {
      const unit = await ProductUnit.findById(item.productUnit).session(session || null);
      if (!unit) throw new AppError(`Unit not found for line item`, 404);
      if (resolveRefIdString(unit.product) !== resolveRefIdString(item.product)) {
        throw new AppError(`Serial ${unit.serialNumber} does not match this product`, 400);
      }
      if (busyIds.includes(unit._id.toString())) {
        throw new AppError(`Unit ${unit.serialNumber} is not available for this period`, 409);
      }
      if (
        ![PRODUCT_UNIT_STATUS.AVAILABLE, PRODUCT_UNIT_STATUS.RESERVED].includes(unit.status)
      ) {
        throw new AppError(`Unit ${unit.serialNumber} is ${unit.status}`, 409);
      }

      unit.status = PRODUCT_UNIT_STATUS.RESERVED;
      unit.currentRental = rental._id;
      await unit.save(opts);
      item.productUnit = unit._id;
      item.inventoryBranch = unit.branch;
      item.status = RENTAL_ITEM_STATUS.RESERVED;
      await item.save(opts);
      allocated.push(unit._id);
      busyIds.push(unit._id.toString());
      continue;
    }

    throw new AppError(
      `Select a serial number or scan the product QR for ${productDoc.name}`,
      400,
    );
  }

  const productIds = [...new Set(items.map((i) => resolveRefIdString(i.product)))];
  await Promise.all(productIds.map((id) => syncProductUnitCounts(id)));

  return allocated;
};

export const releaseRentalUnits = async ({
  rental,
  items,
  targetUnitStatus = PRODUCT_UNIT_STATUS.AVAILABLE,
  clearRentalLink = true,
  session = null,
}) => {
  const opts = session ? { session } : {};
  const productIds = new Set();

  for (const item of items) {
    if (!item.productUnit) continue;
    const unit = await ProductUnit.findById(item.productUnit).session(session || null);
    if (!unit) continue;

    unit.status = targetUnitStatus;
    if (clearRentalLink) unit.currentRental = null;
    await unit.save(opts);
    productIds.add(resolveRefIdString(item.product));
  }

  await Promise.all([...productIds].map((id) => syncProductUnitCounts(id)));
};

export const assignUnitsAtPickup = async ({
  rental,
  items,
  unitAssignments = [],
  session = null,
}) => {
  const opts = session ? { session } : {};
  const startAt = rental.scheduledStartAt;
  const endAt = rental.scheduledEndAt;

  const assignmentMap = new Map();
  for (const a of unitAssignments) {
    const itemId = a.rentalItemId || a.itemId;
    const unitId = a.productUnitId || a.productUnit;
    if (!itemId || !unitId) continue;
    const key = itemId.toString();
    if (!assignmentMap.has(key)) assignmentMap.set(key, []);
    assignmentMap.get(key).push(unitId);
  }

  const unassigned = items.filter(
    (i) => !rentalItemHasUnit(i) && i.status === RENTAL_ITEM_STATUS.RESERVED,
  );

  for (const item of unassigned) {
    const productDoc = await Product.findById(item.product).session(session || null);
    if (!productDoc) throw new AppError('Product not found for line item', 404);

    let unitIds = [];
    const mapped = assignmentMap.get(item._id.toString()) || [];
    if (mapped.length > 0) {
      unitIds = mapped.map((id) => id.toString());
      if (unitIds.length < item.quantity) {
        throw new AppError(
          `Assign ${item.quantity} serial(s) for ${productDoc.name} (${unitIds.length} selected)`,
          400,
        );
      }
      unitIds = unitIds.slice(0, item.quantity);
    } else {
      const units = await findAvailableUnits({
        productId: resolveRefIdString(item.product),
        startAt,
        endAt,
        quantity: item.quantity,
        excludeRentalId: rental._id,
      });
      if (units.length < item.quantity) {
        throw new AppError(
          `Assign serial numbers at pickup for ${productDoc.name} (${units.length} available, ${item.quantity} needed)`,
          409,
        );
      }
      unitIds = units.slice(0, item.quantity).map((u) => u._id);
    }

    const busyIds = await findBusyUnitIds({
      startAt,
      endAt,
      excludeRentalId: rental._id,
    });

    for (let i = 0; i < unitIds.length; i += 1) {
      const unit = await ProductUnit.findById(unitIds[i]).session(session || null);
      if (!unit) throw new AppError('Serial unit not found', 404);
      if (resolveRefIdString(unit.product) !== resolveRefIdString(item.product)) {
        throw new AppError(`Serial ${unit.serialNumber} does not match this product`, 400);
      }
      if (busyIds.includes(unit._id.toString())) {
        throw new AppError(`Unit ${unit.serialNumber} is not available`, 409);
      }
      if (
        ![PRODUCT_UNIT_STATUS.AVAILABLE, PRODUCT_UNIT_STATUS.RESERVED].includes(unit.status)
      ) {
        throw new AppError(`Unit ${unit.serialNumber} is ${unit.status}`, 409);
      }

      unit.status = PRODUCT_UNIT_STATUS.RESERVED;
      unit.currentRental = rental._id;
      await unit.save(opts);
      busyIds.push(unit._id.toString());

      if (i === 0) {
        item.productUnit = unit._id;
        item.inventoryBranch = unit.branch;
        item.quantity = 1;
        item.status = RENTAL_ITEM_STATUS.RESERVED;
        await item.save(opts);
      } else {
        await RentalItem.create(
          [
            {
              rental: rental._id,
              branch: rental.branch,
              inventoryBranch: unit.branch,
              product: resolveRefIdString(item.product),
              productUnit: unit._id,
              combo: item.combo,
              quantity: 1,
              rateType: item.rateType,
              unitRate: item.unitRate,
              durationDays: item.durationDays,
              lineSubtotal: item.lineSubtotal,
              lineDiscount: item.lineDiscount,
              lineTax: item.lineTax,
              lineTotal: item.lineTotal,
              status: RENTAL_ITEM_STATUS.RESERVED,
            },
          ],
          opts,
        );
      }
    }
  }

  const productIds = [...new Set(items.map((i) => resolveRefIdString(i.product)))];
  await Promise.all(productIds.map((id) => syncProductUnitCounts(id)));
};

export const pickupRentalUnits = async ({ rental, items, session = null }) => {
  const opts = session ? { session } : {};
  const now = new Date();

  for (const item of items) {
    item.status = RENTAL_ITEM_STATUS.ISSUED;
    item.issuedAt = now;
    await item.save(opts);

    if (!item.productUnit) continue;
    const unit = await ProductUnit.findById(item.productUnit).session(session || null);
    if (!unit) continue;
    unit.status = PRODUCT_UNIT_STATUS.RENTED;
    unit.currentRental = rental._id;
    await unit.save(opts);
  }

  const productIds = [...new Set(items.map((i) => resolveRefIdString(i.product)))];
  await Promise.all(productIds.map((id) => syncProductUnitCounts(id)));
};

export const returnRentalUnits = async ({
  rental,
  items,
  sendToMaintenance = false,
  session = null,
}) => {
  const targetStatus = sendToMaintenance
    ? PRODUCT_UNIT_STATUS.MAINTENANCE
    : PRODUCT_UNIT_STATUS.AVAILABLE;

  await releaseRentalUnits({
    rental,
    items,
    targetUnitStatus: targetStatus,
    clearRentalLink: true,
    session,
  });

  const now = new Date();
  for (const item of items) {
    item.status = RENTAL_ITEM_STATUS.RETURNED;
    item.returnedAt = now;
    await item.save(session ? { session } : {});
  }
};

export const runWithTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
