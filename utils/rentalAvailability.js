import Rental from '../models/Rental.js';
import RentalItem from '../models/RentalItem.js';
import ProductUnit from '../models/ProductUnit.js';
import {
  PRODUCT_UNIT_STATUS,
} from '../models/constants/enums.js';
import {
  RENTAL_BLOCKING_STATUSES,
  RENTAL_ITEM_BLOCKING_STATUSES,
} from './rentalConstants.js';
import { buildActiveUnitQuery } from './rentalInventoryHelpers.js';

/**
 * Date ranges overlap when startA < endB && endA > startB.
 */
export const rangesOverlap = (startA, endA, startB, endB) => {
  const a0 = new Date(startA).getTime();
  const a1 = new Date(endA).getTime();
  const b0 = new Date(startB).getTime();
  const b1 = new Date(endB).getTime();
  return a0 < b1 && a1 > b0;
};

/**
 * Rentals that block the booking window (company-wide).
 */
export const findOverlappingRentalIds = async ({
  startAt,
  endAt,
  excludeRentalId = null,
}) => {
  const filter = {
    status: { $in: RENTAL_BLOCKING_STATUSES },
    scheduledStartAt: { $lt: new Date(endAt) },
    scheduledEndAt: { $gt: new Date(startAt) },
  };

  if (excludeRentalId) {
    filter._id = { $ne: excludeRentalId };
  }

  const rentals = await Rental.find(filter).select('_id').lean();
  return rentals.map((r) => r._id);
};

/**
 * Serial units already allocated on overlapping rentals (network-wide).
 */
export const findBusyUnitIds = async ({
  startAt,
  endAt,
  excludeRentalId = null,
}) => {
  const rentalIds = await findOverlappingRentalIds({
    startAt,
    endAt,
    excludeRentalId,
  });

  if (!rentalIds.length) return [];

  const items = await RentalItem.find({
    rental: { $in: rentalIds },
    productUnit: { $ne: null },
    status: { $in: RENTAL_ITEM_BLOCKING_STATUSES },
  })
    .select('productUnit')
    .lean();

  return [...new Set(items.map((i) => i.productUnit.toString()))];
};

/**
 * Quantity of a product already reserved/rented in overlapping bookings (network-wide).
 */
export const countAllocatedProductQuantity = async ({
  productId,
  startAt,
  endAt,
  excludeRentalId = null,
}) => {
  const rentalIds = await findOverlappingRentalIds({
    startAt,
    endAt,
    excludeRentalId,
  });

  if (!rentalIds.length) return 0;

  const result = await RentalItem.aggregate([
    {
      $match: {
        rental: { $in: rentalIds },
        product: productId,
        status: { $in: RENTAL_ITEM_BLOCKING_STATUSES },
      },
    },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);

  return result[0]?.total || 0;
};

/**
 * List unit IDs available for allocation in a window.
 * @param locationBranchId — optional: only units physically at this branch
 */
export const findAvailableUnits = async ({
  productId,
  startAt,
  endAt,
  quantity = 1,
  excludeRentalId = null,
  locationBranchId = null,
}) => {
  const busyIds = await findBusyUnitIds({
    startAt,
    endAt,
    excludeRentalId,
  });

  const units = await ProductUnit.find({
    ...buildActiveUnitQuery(productId, {
      locationBranchId,
      assignableOnly: true,
    }),
    _id: { $nin: busyIds },
  })
    .sort({ status: 1, serialNumber: 1 })
    .limit(quantity)
    .lean();

  return units;
};

/**
 * Validate product availability for a booking window (network pool).
 */
export const validateProductAvailability = async ({
  productId,
  quantity,
  startAt,
  endAt,
  excludeRentalId = null,
  locationBranchId = null,
}) => {
  const allocated = await countAllocatedProductQuantity({
    productId,
    startAt,
    endAt,
    excludeRentalId,
  });

  const totalUnits = await ProductUnit.countDocuments(
    buildActiveUnitQuery(productId, { locationBranchId }),
  );

  const availableCount = Math.max(0, totalUnits - allocated);
  const availableUnits = await findAvailableUnits({
    productId,
    startAt,
    endAt,
    quantity,
    excludeRentalId,
    locationBranchId,
  });

  return {
    productId,
    requested: quantity,
    totalUnits,
    allocatedInWindow: allocated,
    availableCount,
    assignableUnits: availableUnits,
    isAvailable: availableCount >= quantity && availableUnits.length >= quantity,
  };
};
