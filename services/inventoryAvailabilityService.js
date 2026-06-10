import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Maintenance from '../models/Maintenance.js';
import Transfer from '../models/Transfer.js';
import Combo from '../models/Combo.js';
import {
  PRODUCT_UNIT_STATUS,
  MAINTENANCE_STATUS,
  TRANSFER_STATUS,
  TRANSFER_ITEM_STATUS,
} from '../models/constants/enums.js';
import { getCommonInventoryBranchId } from '../utils/rentalInventoryHelpers.js';
import {
  rangesOverlap,
  findOverlappingRentalIds,
  findBusyUnitIds,
  countAllocatedProductQuantity,
  findAvailableUnits,
  validateProductAvailability,
} from '../utils/rentalAvailability.js';
import { validateComboAvailability } from '../utils/comboAvailability.js';

export {
  rangesOverlap,
  findOverlappingRentalIds,
  findBusyUnitIds,
  countAllocatedProductQuantity,
  findAvailableUnits,
  validateProductAvailability,
  validateComboAvailability,
};

/** Unit statuses that never count as rentable */
export const UNAVAILABLE_UNIT_STATUSES = [
  PRODUCT_UNIT_STATUS.MAINTENANCE,
  PRODUCT_UNIT_STATUS.IN_TRANSFER,
  PRODUCT_UNIT_STATUS.RETIRED,
  PRODUCT_UNIT_STATUS.LOST,
  PRODUCT_UNIT_STATUS.RENTED,
];

const productUnitIds = async (productId, locationBranchId = null) => {
  const filter = { product: productId };
  if (locationBranchId) filter.branch = locationBranchId;
  return ProductUnit.find(filter).distinct('_id');
};

/**
 * Units blocked by maintenance (network-wide, filtered to a product).
 */
export const findMaintenanceBlockedUnitIds = async ({
  productId,
  startAt,
  endAt,
  locationBranchId = null,
}) => {
  const unitIds = await productUnitIds(productId, locationBranchId);
  if (!unitIds.length) return [];

  const start = new Date(startAt);
  const end = new Date(endAt);

  const tickets = await Maintenance.find({
    productUnit: { $in: unitIds },
    status: { $in: [MAINTENANCE_STATUS.SCHEDULED, MAINTENANCE_STATUS.IN_PROGRESS] },
    $or: [
      { scheduledAt: { $lte: end }, completedAt: null },
      {
        startedAt: { $lte: end },
        completedAt: { $gte: start },
      },
    ],
  })
    .select('productUnit')
    .lean();

  return [...new Set(tickets.map((t) => t.productUnit?.toString()).filter(Boolean))];
};

/**
 * Units on in-progress transfers (network-wide, filtered to a product).
 */
export const findTransferBlockedUnitIds = async ({
  productId,
  excludeTransferId = null,
  locationBranchId = null,
}) => {
  const unitIds = await productUnitIds(productId, locationBranchId);
  if (!unitIds.length) return [];

  const unitIdSet = new Set(unitIds.map((id) => id.toString()));
  const filter = {
    status: {
      $in: [TRANSFER_STATUS.APPROVED, TRANSFER_STATUS.IN_TRANSIT],
    },
  };
  if (excludeTransferId) filter._id = { $ne: excludeTransferId };

  const transfers = await Transfer.find(filter).select('items').lean();
  const blocked = new Set();

  for (const transfer of transfers) {
    for (const item of transfer.items || []) {
      const unitId = item.productUnit?.toString();
      if (
        unitId &&
        unitIdSet.has(unitId) &&
        [TRANSFER_ITEM_STATUS.PENDING, TRANSFER_ITEM_STATUS.DISPATCHED].includes(
          item.itemStatus,
        )
      ) {
        blocked.add(unitId);
      }
    }
  }

  return [...blocked];
};

/**
 * Central availability check for a product in a booking window (network pool).
 * @param locationBranchId — optional: only count units physically at this branch
 */
export const checkProductAvailability = async ({
  branchId,
  productId,
  quantity,
  startAt,
  endAt,
  excludeRentalId = null,
  excludeTransferId = null,
  locationBranchId = null,
}) => {
  const location = locationBranchId || branchId || null;

  const base = await validateProductAvailability({
    productId,
    quantity,
    startAt,
    endAt,
    excludeRentalId,
    locationBranchId: location,
  });

  const [maintenanceIds, transferIds, unavailableUnits] = await Promise.all([
    findMaintenanceBlockedUnitIds({
      productId,
      startAt,
      endAt,
      locationBranchId: location,
    }),
    findTransferBlockedUnitIds({
      productId,
      excludeTransferId,
      locationBranchId: location,
    }),
    ProductUnit.countDocuments({
      product: productId,
      ...(location ? { branch: location } : {}),
      status: { $in: UNAVAILABLE_UNIT_STATUSES },
    }),
  ]);

  const busyIds = await findBusyUnitIds({
    startAt,
    endAt,
    excludeRentalId,
  });

  const blockedSet = new Set([...maintenanceIds, ...transferIds, ...busyIds]);

  const assignableUnits = base.assignableUnits.filter(
    (u) => !blockedSet.has(u._id.toString()),
  );

  const effectiveAvailable = Math.max(
    0,
    base.availableCount - maintenanceIds.length - transferIds.length,
  );

  return {
    ...base,
    assignableUnits,
    maintenanceBlocked: maintenanceIds.length,
    transferBlocked: transferIds.length,
    unavailableUnitCount: unavailableUnits,
    isAvailable:
      base.isAvailable &&
      assignableUnits.length >= quantity &&
      effectiveAvailable >= quantity,
  };
};

/**
 * Full booking window validation for products + optional combo.
 */
export const checkBookingAvailability = async ({
  branchId,
  startAt,
  endAt,
  combo = null,
  lines = [],
  excludeRentalId = null,
}) => {
  let comboResult = null;
  if (combo) {
    const commonBranchId = await getCommonInventoryBranchId();
    const comboBranchOr = [{ branch: branchId }];
    if (commonBranchId) comboBranchOr.push({ branch: commonBranchId });

    const comboDoc =
      typeof combo === 'object' && combo.items
        ? combo
        : await Combo.findOne({ _id: combo, $or: comboBranchOr });

    if (!comboDoc) {
      comboResult = { isAvailable: false, error: 'Combo not found' };
    } else {
      comboResult = await validateComboAvailability({
        combo: comboDoc,
        startAt,
        endAt,
        excludeRentalId,
      });
    }
  }

  const productResults = await Promise.all(
    lines.map(async (line) =>
      checkProductAvailability({
        branchId,
        productId: line.product,
        quantity: line.quantity || 1,
        startAt,
        endAt,
        excludeRentalId,
      }),
    ),
  );

  const allAvailable =
    productResults.every((r) => r.isAvailable) &&
    (!comboResult || comboResult.isAvailable);

  return {
    available: allAvailable,
    window: { startAt, endAt },
    products: productResults,
    combo: comboResult,
  };
};
