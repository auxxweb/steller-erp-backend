import Rental from '../models/Rental.js';
import RentalItem from '../models/RentalItem.js';
import Customer from '../models/Customer.js';
import Branch from '../models/Branch.js';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Combo from '../models/Combo.js';
import { buildComboRentalLines } from './comboService.js';
import {
  COMBO_STATUS,
  PRODUCT_STATUS,
  PRODUCT_UNIT_STATUS,
  RENTAL_STATUS,
  RENTAL_ITEM_STATUS,
  RENTAL_TYPE,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import {
  applyEmployeeRentalScope,
  assertEmployeeRentalAccess,
} from '../utils/employeeScope.js';
import { generateRentalNumber } from '../utils/rentalNumber.js';
import {
  computeDurationDays,
  computeLineAmounts,
  aggregateRentalAmounts,
  resolveUnitRate,
} from '../utils/rentalPricing.js';
import { validateProductAvailability } from '../utils/rentalAvailability.js';
import {
  countActiveProductUnits,
  rentalItemHasUnit,
} from '../utils/rentalInventoryHelpers.js';
import { checkBookingAvailability } from './inventoryAvailabilityService.js';
import { assertCustomerCanBook } from './riskEngineService.js';
import {
  DEFAULT_RESERVATION_TTL_MINUTES,
  RENTAL_BLOCKING_STATUSES,
  assertRentalTransition,
} from '../utils/rentalConstants.js';
import {
  allocateUnitsForRental,
  assignUnitsAtPickup,
  releaseRentalUnits,
  pickupRentalUnits,
  returnRentalUnits,
  runWithTransaction,
} from './rentalAllocationService.js';

const RENTAL_POPULATE = [
  { path: 'branch', select: 'name code' },
  { path: 'customer', select: 'name phone email status' },
  { path: 'combo', select: 'name code' },
  { path: 'guarantor', select: 'name phone' },
  { path: 'handledBy', select: 'name email' },
  { path: 'deliveryStaff', select: 'name email' },
];

const ITEM_POPULATE = [
  { path: 'product', select: 'name sku pricing status' },
  { path: 'productUnit', select: 'serialNumber status qrPayload' },
  { path: 'combo', select: 'name code' },
];

export const resolveBranchId = (actor, branchFromPayload) => {
  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    if (!actor.branch) throw new AppError('No branch assigned to your account', 403);
    return actor.branch;
  }
  if (actor.role === ROLES.SUPER_ADMIN) {
    if (!branchFromPayload) throw new AppError('branch is required', 400);
    return branchFromPayload;
  }
  throw new AppError('You do not have permission for this action', 403);
};

const buildRentalFilter = async (actor, query = {}) => {
  let filter = {};

  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    filter.branch = actor.branch;
  } else if (actor.role === ROLES.DELIVERY_STAFF) {
    filter.branch = actor.branch;
  } else if (query.branch) {
    filter.branch = query.branch;
  }

  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => Object.values(RENTAL_STATUS).includes(s));
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = { $in: statuses };
  }
  if (query.customer) filter.customer = query.customer;

  if (query.rentalType && Object.values(RENTAL_TYPE).includes(query.rentalType)) {
    filter.rentalType = query.rentalType;
  }

  if (query.period) {
    applyDatePeriodFilter(filter, query, 'createdAt');
  } else if (query.from || query.to) {
    filter.scheduledStartAt = {};
    if (query.from) filter.scheduledStartAt.$gte = new Date(query.from);
    if (query.to) {
      filter.scheduledEndAt = { ...(filter.scheduledEndAt || {}), $lte: new Date(query.to) };
    }
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ rentalNumber: regex }, { notes: regex }];
  }

  filter = await applyEmployeeRentalScope(filter, actor);
  return filter;
};

export const syncRentalOverdueStatus = async (rental) => {
  if (
    ![RENTAL_STATUS.ACTIVE, RENTAL_STATUS.PICKED_UP].includes(rental.status)
  ) {
    return rental;
  }

  if (new Date() > new Date(rental.scheduledEndAt)) {
    rental.status = RENTAL_STATUS.OVERDUE;
    await rental.save();
  }

  return rental;
};

const assertReservationNotExpired = (rental) => {
  if (
    rental.status === RENTAL_STATUS.RESERVED &&
    rental.reservationExpiresAt &&
    new Date() > new Date(rental.reservationExpiresAt)
  ) {
    throw new AppError('Reservation has expired — re-reserve or cancel', 409);
  }
};

const loadRentalForActor = async (id, actor) => {
  const rental = await Rental.findById(id).populate(RENTAL_POPULATE);
  if (!rental) throw new AppError('Rental not found', 404);

  const branchId = rental.branch?._id?.toString() || rental.branch?.toString();
  const branchRoles = [ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE, ROLES.DELIVERY_STAFF];

  if (branchRoles.includes(actor.role) && branchId !== actor.branch?.toString()) {
    throw new AppError('You do not have access to this rental', 403);
  }

  await assertEmployeeRentalAccess(rental, actor);

  await syncRentalOverdueStatus(rental);
  return rental;
};

const loadRentalItems = async (rentalId) =>
  RentalItem.find({ rental: rentalId }).populate(ITEM_POPULATE);

/**
 * Rental inventory is tracked per serial (ProductUnit) under a product master.
 * All units are in the company pool; branch on unit = current physical location.
 */
const assertSerialInventoryForLines = async (lines, _fulfillmentBranchId, options = {}) => {
  const { requireSerialAssignment = false } = options;

  for (const line of lines) {
    const product = await Product.findById(line.product).populate('branch', 'code');
    if (!product) throw new AppError('Product not found', 404);

    if (!product.trackUnits) {
      throw new AppError(
        `Product "${product.name}" must track serial units for rentals. Enable unit tracking on the product.`,
        400,
      );
    }

    const unitCount = await countActiveProductUnits(product);

    if (unitCount === 0) {
      throw new AppError(
        `Product "${product.name}" has no serial units. Open the product → Serial units → Add unit.`,
        400,
      );
    }

    const quantity = line.quantity || 1;
    if (requireSerialAssignment && quantity === 1 && !line.productUnit) {
      throw new AppError(
        `Direct rental requires a serial number for "${product.name}". Select or scan a unit.`,
        400,
      );
    }

    if (line.productUnit) {
      const unit = await ProductUnit.findById(line.productUnit);
      if (!unit) throw new AppError('Serial unit not found', 404);
      if (unit.product.toString() !== product._id.toString()) {
        throw new AppError(
          `Serial ${unit.serialNumber} does not belong to product "${product.name}"`,
          400,
        );
      }
    }
  }
};

const resolveRentalSchedule = (payload) => {
  const rentalType = payload.rentalType || RENTAL_TYPE.DIRECT;
  let startAt;
  if (rentalType === RENTAL_TYPE.DIRECT) {
    startAt = new Date();
  } else {
    startAt = new Date(payload.scheduledStartAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new AppError('Invalid scheduledStartAt', 400);
    }
  }
  const endAt = new Date(payload.scheduledEndAt);
  if (Number.isNaN(endAt.getTime())) {
    throw new AppError('Invalid scheduledEndAt', 400);
  }
  return { rentalType, startAt, endAt };
};

/**
 * Expand combo + line items into normalized booking lines.
 */
export const buildBookingLines = async ({
  branchId,
  comboId,
  items = [],
  scheduledStartAt,
  scheduledEndAt,
  rateType = 'daily',
}) => {
  const lines = [];

  if (comboId) {
    const comboLines = await buildComboRentalLines({
      comboId,
      branchId,
      scheduledStartAt,
      scheduledEndAt,
      rateType,
    });
    lines.push(...comboLines);
  }

  for (const row of items) {
    lines.push({
      product: row.product,
      productUnit: row.productUnit,
      quantity: row.quantity || 1,
      combo: row.combo || null,
      rateType: row.rateType || 'daily',
      unitRate: row.unitRate,
      lineDiscount: row.lineDiscount || 0,
    });
  }

  if (!lines.length) {
    throw new AppError('At least one product or combo is required', 400);
  }

  return lines;
};

export const checkAvailability = async (payload, actor) => {
  const fulfillmentBranchId = resolveBranchId(actor, payload.branch);
  const { rentalType, startAt, endAt } = resolveRentalSchedule(payload);
  if (endAt <= startAt) {
    throw new AppError('End date must be after start date', 400);
  }

  const lines = await buildBookingLines({
    branchId: fulfillmentBranchId,
    comboId: payload.combo,
    items: payload.items || [],
    scheduledStartAt: startAt,
    scheduledEndAt: endAt,
    rateType: payload.rateType || 'daily',
  });

  if (!payload.combo) {
    await assertSerialInventoryForLines(lines, fulfillmentBranchId, {
      requireSerialAssignment: rentalType === RENTAL_TYPE.DIRECT,
    });
  }

  return checkBookingAvailability({
    branchId: fulfillmentBranchId,
    startAt,
    endAt,
    combo: payload.combo,
    lines,
    excludeRentalId: payload.excludeRentalId,
  });
};

const createLineItems = async ({ rental, lines, durationDays, taxRate, session }) => {
  const opts = session ? { session } : {};
  const created = [];

  for (const line of lines) {
    const product = await Product.findById(line.product).session(session || null);
    if (!product) throw new AppError('Product not found', 404);
    if (product.status !== PRODUCT_STATUS.ACTIVE) {
      throw new AppError(`Product ${product.name} is not active`, 400);
    }

    let inventoryBranch = product.branch;
    if (line.productUnit) {
      const unit = await ProductUnit.findById(line.productUnit).session(session || null);
      if (unit?.branch) inventoryBranch = unit.branch;
    }

    const unitRate =
      line.unitRate ??
      resolveUnitRate(line.pricingSource || product.pricing, line.rateType);

    const amounts = computeLineAmounts({
      unitRate,
      quantity: line.quantity,
      durationDays,
      rateType: line.rateType,
      lineDiscount: line.lineDiscount || 0,
      taxRate,
    });

    const item = await RentalItem.create(
      [
        {
          rental: rental._id,
          branch: rental.branch,
          inventoryBranch,
          product: product._id,
          productUnit: line.productUnit || null,
          combo: line.combo || null,
          quantity: line.quantity,
          rateType: line.rateType,
          unitRate,
          durationDays,
          ...amounts,
          status: RENTAL_ITEM_STATUS.PENDING,
        },
      ],
      opts,
    );

    created.push(item[0]);
  }

  return created;
};

export const getRentalStats = async (actor, query = {}) => {
  const filter = await buildRentalFilter(actor, query);

  const [statusCounts, total] = await Promise.all([
    Rental.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Rental.countDocuments(filter),
  ]);

  const byStatus = Object.values(RENTAL_STATUS).reduce((a, s) => ({ ...a, [s]: 0 }), {});
  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return { total, byStatus };
};

export const listRentals = async (query, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  const filter = await buildRentalFilter(actor, query);
  const sortField = query.sortBy || 'scheduledStartAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [rentals, total] = await Promise.all([
    Rental.find(filter)
      .populate(RENTAL_POPULATE)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    Rental.countDocuments(filter),
  ]);

  return {
    rentals: rentals.map((r) => r.toPublicJSON()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getRentalById = async (id, actor, { includeItems = true } = {}) => {
  const rental = await loadRentalForActor(id, actor);
  const result = { rental: rental.toPublicJSON() };

  if (includeItems) {
    const items = await loadRentalItems(rental._id);
    result.items = items.map((i) => i.toPublicJSON());
  }

  return result;
};

export const createRental = async (payload, actor) => {
  const branchId = resolveBranchId(actor, payload.branch);
  const branch = await Branch.findById(branchId);
  if (!branch) throw new AppError('Branch not found', 404);

  const customer = await Customer.findById(payload.customer);
  if (!customer) throw new AppError('Customer not found', 404);
  if (customer.branch.toString() !== branchId.toString()) {
    throw new AppError('Customer does not belong to this branch', 400);
  }
  await assertCustomerCanBook(payload.customer, {
    allowOverride: Boolean(payload.riskOverride),
  });

  const { rentalType, startAt, endAt } = resolveRentalSchedule(payload);
  const requireSerialAssignment = rentalType === RENTAL_TYPE.DIRECT;

  if (endAt <= startAt) throw new AppError('End date must be after start date', 400);

  const availability = await checkAvailability(
    {
      ...payload,
      branch: branchId,
      scheduledStartAt: startAt.toISOString(),
      scheduledEndAt: endAt.toISOString(),
      rentalType,
    },
    actor,
  );

  if (!availability.available) {
    throw new AppError('One or more products are not available for the selected dates', 409);
  }

  const lines = await buildBookingLines({
    branchId,
    comboId: payload.combo,
    items: payload.items || [],
    scheduledStartAt: startAt,
    scheduledEndAt: endAt,
    rateType: payload.rateType || 'daily',
  });

  await assertSerialInventoryForLines(lines, branchId, {
    requireSerialAssignment,
  });

  const durationDays = computeDurationDays(startAt, endAt);
  const taxRate = payload.taxRate ?? 18;
  const reserveNow = payload.reserve !== false && payload.status !== RENTAL_STATUS.DRAFT;

  return runWithTransaction(async (session) => {
    const rentalNumber = await generateRentalNumber(branch.code);
    const lineDocs = [];

    const rental = await Rental.create(
      [
        {
          rentalNumber,
          branch: branchId,
          customer: customer._id,
          guarantor: payload.guarantor || null,
          combo: payload.combo || null,
          handledBy: actor._id,
          deliveryStaff: payload.deliveryStaff || null,
          status: RENTAL_STATUS.DRAFT,
          rentalType,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          pickupAddress: payload.pickupAddress?.trim(),
          returnAddress: payload.returnAddress?.trim(),
          taxRate,
          notes: payload.notes?.trim(),
          createdBy: actor._id,
        },
      ],
      { session },
    );

    const rentalDoc = rental[0];
    const items = await createLineItems({
      rental: rentalDoc,
      lines,
      durationDays,
      taxRate,
      session,
    });

    rentalDoc.amounts = aggregateRentalAmounts(items, {
      taxRate,
      deposit: payload.deposit,
    });
    await rentalDoc.save({ session });

    if (reserveNow) {
      await reserveRentalInternal(rentalDoc, items, {
        ttlMinutes: payload.reservationTtlMinutes,
        session,
      });

      if (rentalType === RENTAL_TYPE.DIRECT) {
        const issuedItems = await RentalItem.find({ rental: rentalDoc._id }).session(session);
        await activateDirectRentalInternal(rentalDoc, issuedItems, actor, session);
      }
    }

    await rentalDoc.populate(RENTAL_POPULATE);
    const freshItems = await RentalItem.find({ rental: rentalDoc._id })
      .session(session)
      .populate(ITEM_POPULATE);

    return {
      rental: rentalDoc.toPublicJSON(),
      items: freshItems.map((i) => i.toPublicJSON()),
    };
  });
};

const reserveRentalInternal = async (rental, items, { ttlMinutes, session } = {}) => {
  assertRentalTransition(rental.status, RENTAL_STATUS.RESERVED);

  const deferUnitAssignment = rental.rentalType === RENTAL_TYPE.PREBOOK;

  await allocateUnitsForRental({
    rental,
    items,
    session,
    deferUnitAssignment,
  });

  const ttl = ttlMinutes ?? DEFAULT_RESERVATION_TTL_MINUTES;
  rental.status = RENTAL_STATUS.RESERVED;
  if (rental.rentalType !== RENTAL_TYPE.DIRECT) {
    rental.reservationExpiresAt = new Date(Date.now() + ttl * 60 * 1000);
  }
  rental.updatedBy = rental.updatedBy;
  await rental.save(session ? { session } : {});
};

/** Direct rentals: serials assigned at booking → units go out on rent immediately (no pickup step). */
const activateDirectRentalInternal = async (rental, items, actor, session = null) => {
  if (rental.rentalType !== RENTAL_TYPE.DIRECT) return;

  const opts = session ? { session } : {};
  const lineItems = items?.length
    ? items
    : await RentalItem.find({ rental: rental._id }).session(session || null);

  const missingSerial = lineItems.filter((i) => !i.productUnit);
  if (missingSerial.length) {
    throw new AppError(
      'Direct rental requires a serial number on each line before it can go active',
      400,
    );
  }

  await pickupRentalUnits({ rental, items: lineItems, session });
  assertRentalTransition(rental.status, RENTAL_STATUS.ACTIVE);
  rental.status = RENTAL_STATUS.ACTIVE;
  rental.actualStartAt = new Date();
  rental.reservationExpiresAt = undefined;
  rental.updatedBy = actor._id;
  await rental.save(opts);
};

export const reserveRental = async (id, actor, { ttlMinutes } = {}) => {
  const rental = await loadRentalForActor(id, actor);

  if (![RENTAL_STATUS.DRAFT, RENTAL_STATUS.RESERVED].includes(rental.status)) {
    throw new AppError('Only draft or reserved rentals can be re-reserved', 400);
  }

  const items = await loadRentalItems(rental._id);

  const availability = await checkAvailability(
    {
      branch: rental.branch._id || rental.branch,
      scheduledStartAt: rental.scheduledStartAt,
      scheduledEndAt: rental.scheduledEndAt,
      items: items.map((i) => ({
        product: i.product._id || i.product,
        quantity: i.quantity,
        productUnit: i.productUnit?._id || i.productUnit,
      })),
      excludeRentalId: rental._id,
    },
    actor,
  );

  if (!availability.available) {
    throw new AppError('Products no longer available for this window', 409);
  }

  return runWithTransaction(async (session) => {
    if (rental.status === RENTAL_STATUS.RESERVED) {
      await releaseRentalUnits({ rental, items, session });
      for (const i of items) {
        i.status = RENTAL_ITEM_STATUS.PENDING;
        i.productUnit = null;
        await i.save({ session });
      }
      rental.status = RENTAL_STATUS.DRAFT;
      await rental.save({ session });
    }

    const activeItems = await RentalItem.find({ rental: rental._id }).session(session);
    await reserveRentalInternal(rental, activeItems, {
      ttlMinutes,
      session,
    });

    if (rental.rentalType === RENTAL_TYPE.DIRECT) {
      const issuedItems = await RentalItem.find({ rental: rental._id }).session(session);
      await activateDirectRentalInternal(rental, issuedItems, actor, session);
    }

    await rental.populate(RENTAL_POPULATE);
    const freshItems = await RentalItem.find({ rental: rental._id })
      .session(session)
      .populate(ITEM_POPULATE);

    return {
      rental: rental.toPublicJSON(),
      items: freshItems.map((i) => i.toPublicJSON()),
    };
  });
};

export const pickupRental = async (id, actor, payload = {}) => {
  const rental = await loadRentalForActor(id, actor);

  if (rental.rentalType === RENTAL_TYPE.DIRECT) {
    throw new AppError(
      'Pickup is only for prebookings. Direct rentals are activated when the booking is created.',
      400,
    );
  }

  assertReservationNotExpired(rental);
  assertRentalTransition(rental.status, RENTAL_STATUS.PICKED_UP);

  const items = await loadRentalItems(rental._id);
  return runWithTransaction(async (session) => {
    if (items.some((i) => !rentalItemHasUnit(i))) {
      await assignUnitsAtPickup({
        rental,
        items,
        unitAssignments: payload.unitAssignments || [],
        session,
      });
    }

    const itemsForPickup = await RentalItem.find({ rental: rental._id }).session(session);
    await pickupRentalUnits({ rental, items: itemsForPickup, session });

    rental.status = RENTAL_STATUS.PICKED_UP;
    rental.pickedUpAt = new Date();
    rental.actualStartAt = payload.actualStartAt
      ? new Date(payload.actualStartAt)
      : new Date();
    if (payload.deliveryStaff) rental.deliveryStaff = payload.deliveryStaff;
    rental.updatedBy = actor._id;
    await rental.save({ session });

    if (payload.activate !== false) {
      assertRentalTransition(RENTAL_STATUS.PICKED_UP, RENTAL_STATUS.ACTIVE);
      rental.status = RENTAL_STATUS.ACTIVE;
      await rental.save({ session });
    }

    await rental.populate(RENTAL_POPULATE);
    const freshItems = await RentalItem.find({ rental: rental._id })
      .session(session)
      .populate(ITEM_POPULATE);

    return {
      rental: rental.toPublicJSON(),
      items: freshItems.map((i) => i.toPublicJSON()),
    };
  });
};

export const activateRental = async (id, actor) => {
  const rental = await loadRentalForActor(id, actor);
  assertRentalTransition(rental.status, RENTAL_STATUS.ACTIVE);

  rental.status = RENTAL_STATUS.ACTIVE;
  if (!rental.actualStartAt) rental.actualStartAt = new Date();
  rental.updatedBy = actor._id;
  await rental.save();
  await rental.populate(RENTAL_POPULATE);

  const items = await loadRentalItems(rental._id);
  return {
    rental: rental.toPublicJSON(),
    items: items.map((i) => i.toPublicJSON()),
  };
};

export const returnRental = async (id, actor, payload = {}) => {
  const rental = await loadRentalForActor(id, actor);

  const allowedFrom = [
    RENTAL_STATUS.PICKED_UP,
    RENTAL_STATUS.ACTIVE,
    RENTAL_STATUS.OVERDUE,
    RENTAL_STATUS.MAINTENANCE,
    RENTAL_STATUS.PARTIALLY_RETURNED,
  ];

  if (!allowedFrom.includes(rental.status)) {
    throw new AppError(`Cannot return rental in status: ${rental.status}`, 400);
  }

  const allItems = await loadRentalItems(rental._id);
  const returnIds = payload.returnedItemIds?.length
    ? payload.returnedItemIds.map(String)
    : null;

  const itemsToReturn = returnIds
    ? allItems.filter((i) => returnIds.includes(i._id.toString()))
  : allItems;

  if (!itemsToReturn.length) {
    throw new AppError('No matching line items to return', 400);
  }

  const alreadyReturned = itemsToReturn.filter(
    (i) => i.status === RENTAL_ITEM_STATUS.RETURNED,
  );
  if (alreadyReturned.length) {
    throw new AppError('One or more items are already returned', 409);
  }

  return runWithTransaction(async (session) => {
    const maintenanceUnitIds = new Set(
      (payload.maintenanceUnitIds || []).map(String),
    );

    for (const item of itemsToReturn) {
      const sendMaint =
        Boolean(payload.sendUnitsToMaintenance) ||
        (item.productUnit &&
          maintenanceUnitIds.has(item.productUnit._id?.toString() || item.productUnit.toString()));

      await returnRentalUnits({
        rental,
        items: [item],
        sendToMaintenance: sendMaint,
        session,
      });
    }

    const freshItems = await RentalItem.find({ rental: rental._id })
      .session(session)
      .populate(ITEM_POPULATE);

    const outstanding = freshItems.filter(
      (i) =>
        [RENTAL_ITEM_STATUS.ISSUED, RENTAL_ITEM_STATUS.RESERVED].includes(i.status),
    );

    if (outstanding.length > 0) {
      rental.status = RENTAL_STATUS.PARTIALLY_RETURNED;
    } else {
      rental.status = RENTAL_STATUS.RETURNED;
      rental.returnedAt = new Date();
      rental.actualEndAt = payload.actualEndAt
        ? new Date(payload.actualEndAt)
        : new Date();

      if (new Date() > new Date(rental.scheduledEndAt)) {
        const daysLate = Math.ceil(
          (Date.now() - new Date(rental.scheduledEndAt).getTime()) / (24 * 60 * 60 * 1000),
        );
        const lateFee = daysLate * (rental.amounts?.lateFeePerDay || 0);
        if (lateFee > 0) {
          rental.amounts = { ...rental.amounts, lateFee };
        }
      }
    }

    if (payload.damageFee != null) {
      rental.amounts = { ...rental.amounts, damageFee: Number(payload.damageFee) };
    }

    rental.updatedBy = actor._id;
    await rental.save({ session });

    await rental.populate(RENTAL_POPULATE);

    return {
      rental: rental.toPublicJSON(),
      items: freshItems.map((i) => i.toPublicJSON()),
      partial: outstanding.length > 0,
    };
  });
};

export const enterRentalMaintenance = async (id, actor, payload = {}) => {
  const rental = await loadRentalForActor(id, actor);
  assertRentalTransition(rental.status, RENTAL_STATUS.MAINTENANCE);

  rental.status = RENTAL_STATUS.MAINTENANCE;
  rental.maintenanceStartedAt = new Date();
  rental.internalNotes = payload.notes || rental.internalNotes;
  rental.updatedBy = actor._id;
  await rental.save();
  await rental.populate(RENTAL_POPULATE);

  const items = await loadRentalItems(rental._id);
  return {
    rental: rental.toPublicJSON(),
    items: items.map((i) => i.toPublicJSON()),
  };
};

export const cancelRental = async (id, actor, reason) => {
  const rental = await loadRentalForActor(id, actor);

  if ([RENTAL_STATUS.RETURNED, RENTAL_STATUS.CLOSED, RENTAL_STATUS.CANCELLED].includes(rental.status)) {
    throw new AppError('Rental cannot be cancelled', 400);
  }

  const items = await loadRentalItems(rental._id);

  return runWithTransaction(async (session) => {
    if (RENTAL_BLOCKING_STATUSES.includes(rental.status)) {
      await releaseRentalUnits({ rental, items, session });
    }

    for (const item of items) {
      item.status = RENTAL_ITEM_STATUS.CANCELLED;
      await item.save(session ? { session } : {});
    }

    rental.status = RENTAL_STATUS.CANCELLED;
    rental.cancelledAt = new Date();
    rental.cancelReason = reason?.trim();
    rental.updatedBy = actor._id;
    await rental.save({ session });

    await rental.populate(RENTAL_POPULATE);
    return {
      rental: rental.toPublicJSON(),
      items: items.map((i) => i.toPublicJSON()),
    };
  });
};

export const closeRental = async (id, actor) => {
  const rental = await loadRentalForActor(id, actor);
  assertRentalTransition(rental.status, RENTAL_STATUS.CLOSED);

  rental.status = RENTAL_STATUS.CLOSED;
  rental.updatedBy = actor._id;
  await rental.save();
  await rental.populate(RENTAL_POPULATE);

  const items = await loadRentalItems(rental._id);
  return {
    rental: rental.toPublicJSON(),
    items: items.map((i) => i.toPublicJSON()),
  };
};

export const updateRental = async (id, payload, actor) => {
  const rental = await loadRentalForActor(id, actor);

  if (rental.status !== RENTAL_STATUS.DRAFT) {
    throw new AppError('Only draft rentals can be updated', 400);
  }

  if (payload.scheduledStartAt) rental.scheduledStartAt = new Date(payload.scheduledStartAt);
  if (payload.scheduledEndAt) rental.scheduledEndAt = new Date(payload.scheduledEndAt);
  if (payload.notes !== undefined) rental.notes = payload.notes?.trim();
  if (payload.pickupAddress !== undefined) rental.pickupAddress = payload.pickupAddress?.trim();
  if (payload.returnAddress !== undefined) rental.returnAddress = payload.returnAddress?.trim();
  if (payload.guarantor !== undefined) rental.guarantor = payload.guarantor;

  rental.updatedBy = actor._id;
  await rental.save();
  await rental.populate(RENTAL_POPULATE);

  return getRentalById(rental._id, actor);
};
