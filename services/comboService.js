import Combo from '../models/Combo.js';
import Product from '../models/Product.js';
import Branch from '../models/Branch.js';
import Rental from '../models/Rental.js';
import { COMBO_STATUS, PRODUCT_STATUS, ROLES } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import { computeComboPricing } from '../utils/comboPricing.js';
import { validateComboAvailability } from '../utils/comboAvailability.js';
import { computeDurationDays } from '../utils/rentalPricing.js';
import {
  buildComboBranchFilter,
  canActorAccessComboBranch,
  getCommonInventoryBranchId,
} from '../utils/rentalInventoryHelpers.js';
import { COMMON_INVENTORY_PAYLOAD_VALUE } from '../models/constants/enums.js';

const COMBO_POPULATE = [
  { path: 'branch', select: 'name code' },
  {
    path: 'items.product',
    select: 'name sku status pricing branch totalUnits availableUnits',
  },
];

const formatCombo = (doc) => doc.toPublicJSON();

export const resolveBranchId = async (actor, branchFromPayload) => {
  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    if (!actor.branch) throw new AppError('No branch assigned to your account', 403);
    return actor.branch;
  }
  if (actor.role === ROLES.SUPER_ADMIN) {
    if (!branchFromPayload) throw new AppError('branch is required', 400);
    if (branchFromPayload === COMMON_INVENTORY_PAYLOAD_VALUE) {
      const commonId = await getCommonInventoryBranchId();
      if (!commonId) {
        throw new AppError('Shared inventory branch (COMMON) is not configured', 500);
      }
      return commonId;
    }
    return branchFromPayload;
  }
  throw new AppError('You do not have permission for this action', 403);
};

const buildComboFilter = async (actor, query = {}) => {
  const filter = {
    ...(await buildComboBranchFilter(actor, query)),
  };

  if (query.status) filter.status = query.status;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { code: regex }, { description: regex }];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

const loadProductsForCombo = async (combo) => {
  const ids = combo.items.map((i) => i.product?._id || i.product);
  return Product.find({ _id: { $in: ids } });
};

const assertComboItemsValid = async (items, branchId) => {
  if (!items?.length) throw new AppError('Combo must include at least one product', 400);

  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } });

  if (products.length !== productIds.length) {
    throw new AppError('One or more products not found', 404);
  }

  for (const product of products) {
    if (product.status !== PRODUCT_STATUS.ACTIVE) {
      throw new AppError(`Product ${product.name} is not active`, 400);
    }
  }
};

export const getComboStats = async (actor, query = {}) => {
  const filter = await buildComboFilter(actor, query);

  const [statusCounts, total] = await Promise.all([
    Combo.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Combo.countDocuments(filter),
  ]);

  const byStatus = Object.values(COMBO_STATUS).reduce((a, s) => ({ ...a, [s]: 0 }), {});
  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return { total, byStatus };
};

export const listCombos = async (query, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  const filter = await buildComboFilter(actor, query);

  const [combos, total] = await Promise.all([
    Combo.find(filter).populate(COMBO_POPULATE).sort({ name: 1 }).skip(skip).limit(limit),
    Combo.countDocuments(filter),
  ]);

  return {
    combos: combos.map(formatCombo),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getComboById = async (id, actor) => {
  const combo = await Combo.findById(id).populate(COMBO_POPULATE);
  if (!combo) throw new AppError('Combo not found', 404);

  const branchId = combo.branch?._id?.toString() || combo.branch?.toString();
  const allowed = await canActorAccessComboBranch(branchId, actor);
  if (!allowed) {
    throw new AppError('You do not have access to this combo', 403);
  }

  return combo;
};

export const calculateComboPrice = async (id, actor, query = {}) => {
  const combo = await getComboById(id, actor);
  const products = await loadProductsForCombo(combo);

  let durationDays = Number(query.durationDays) || 1;
  if (query.scheduledStartAt && query.scheduledEndAt) {
    durationDays = computeDurationDays(query.scheduledStartAt, query.scheduledEndAt);
  }

  const pricing = computeComboPricing({
    combo,
    products,
    durationDays,
    rateType: query.rateType || 'daily',
    taxRate: query.taxRate != null ? Number(query.taxRate) : 0,
  });

  return { combo: formatCombo(combo), pricing };
};

export const checkComboAvailability = async (id, actor, query = {}) => {
  const combo = await getComboById(id, actor);
  const branchId = combo.branch?._id || combo.branch;

  if (!query.scheduledStartAt || !query.scheduledEndAt) {
    throw new AppError('scheduledStartAt and scheduledEndAt are required', 400);
  }

  const availability = await validateComboAvailability({
    combo,
    startAt: new Date(query.scheduledStartAt),
    endAt: new Date(query.scheduledEndAt),
    excludeRentalId: query.excludeRentalId,
  });

  return { combo: formatCombo(combo), availability };
};

export const previewCombo = async (payload, actor) => {
  await resolveBranchId(actor, payload.branch);
  const products = await Product.find({ _id: { $in: payload.items.map((i) => i.product) } });

  const comboLike = {
    items: payload.items,
    pricingRule: payload.pricingRule,
    pricing: payload.pricing || {},
  };

  let durationDays = Number(payload.durationDays) || 1;
  if (payload.scheduledStartAt && payload.scheduledEndAt) {
    durationDays = computeDurationDays(payload.scheduledStartAt, payload.scheduledEndAt);
  }

  const pricing = computeComboPricing({
    combo: comboLike,
    products,
    durationDays,
    rateType: payload.rateType || 'daily',
    taxRate: payload.taxRate != null ? Number(payload.taxRate) : 0,
  });

  let availability = null;
  if (payload.scheduledStartAt && payload.scheduledEndAt) {
    availability = await validateComboAvailability({
      combo: { ...comboLike, _id: null, items: payload.items },
      startAt: new Date(payload.scheduledStartAt),
      endAt: new Date(payload.scheduledEndAt),
    });
  }

  return { pricing, availability };
};

export const createCombo = async (payload, actor) => {
  const branchId = await resolveBranchId(actor, payload.branch);
  const branch = await Branch.findById(branchId);
  if (!branch) throw new AppError('Branch not found', 404);

  await assertComboItemsValid(payload.items, branchId);

  const code = payload.code?.trim().toUpperCase();
  const duplicate = await Combo.findOne({ branch: branchId, code });
  if (duplicate) throw new AppError('Combo code already exists at this branch', 409);

  const combo = await Combo.create({
    name: payload.name.trim(),
    code,
    branch: branchId,
    description: payload.description?.trim(),
    items: payload.items.map((i) => ({ product: i.product, quantity: i.quantity || 1 })),
    pricingRule: payload.pricingRule,
    pricing: payload.pricing || {},
    status: payload.status || COMBO_STATUS.ACTIVE,
    image: payload.image?.trim(),
    createdBy: actor._id,
  });

  await combo.populate(COMBO_POPULATE);
  return combo;
};

export const updateCombo = async (id, payload, actor) => {
  const combo = await getComboById(id, actor);
  const branchId = combo.branch?._id || combo.branch;

  if (payload.items) {
    await assertComboItemsValid(payload.items, branchId);
    combo.items = payload.items.map((i) => ({
      product: i.product,
      quantity: i.quantity || 1,
    }));
  }

  if (payload.code) {
    const code = payload.code.trim().toUpperCase();
    const dup = await Combo.findOne({ branch: branchId, code, _id: { $ne: combo._id } });
    if (dup) throw new AppError('Combo code already in use', 409);
    combo.code = code;
  }

  if (payload.name !== undefined) combo.name = payload.name.trim();
  if (payload.description !== undefined) combo.description = payload.description?.trim();
  if (payload.pricingRule !== undefined) combo.pricingRule = payload.pricingRule;
  if (payload.pricing !== undefined) combo.pricing = { ...combo.pricing, ...payload.pricing };
  if (payload.status !== undefined) combo.status = payload.status;
  if (payload.image !== undefined) combo.image = payload.image?.trim();
  combo.updatedBy = actor._id;

  await combo.save();
  await combo.populate(COMBO_POPULATE);
  return combo;
};

export const deleteCombo = async (id, actor) => {
  const combo = await getComboById(id, actor);

  const activeRentals = await Rental.countDocuments({
    combo: combo._id,
    status: { $in: ['reserved', 'picked_up', 'active', 'overdue', 'maintenance'] },
  });

  if (activeRentals > 0) {
    combo.status = COMBO_STATUS.INACTIVE;
    await combo.save();
    return {
      combo: formatCombo(combo),
      softDeleted: true,
      message: 'Combo has active rentals and was marked inactive',
    };
  }

  await Combo.findByIdAndDelete(combo._id);
  return {
    combo: formatCombo(combo),
    softDeleted: false,
    message: 'Combo deleted successfully',
  };
};

/**
 * Used by rental engine — expand combo to priced line items.
 */
export const buildComboRentalLines = async ({
  comboId,
  branchId: _rentalBranchId,
  scheduledStartAt,
  scheduledEndAt,
  rateType = 'daily',
}) => {
  const combo = await Combo.findById(comboId).populate({ path: 'branch', select: 'code' });
  if (!combo) throw new AppError('Combo not found', 404);
  if (combo.status !== COMBO_STATUS.ACTIVE) {
    throw new AppError('Combo is not active', 400);
  }
  const products = await loadProductsForCombo(combo);
  const durationDays = computeDurationDays(scheduledStartAt, scheduledEndAt);
  const pricing = computeComboPricing({
    combo,
    products,
    durationDays,
    rateType,
  });

  return pricing.lines.map((line) => ({
    product: line.productId,
    quantity: line.quantity,
    combo: combo._id,
    rateType,
    unitRate:
      line.quantity > 0 && durationDays > 0
        ? line.lineSubtotal / (line.quantity * (pricing.rateType === 'daily' ? durationDays : 1))
        : line.unitRate,
    lineDiscount: line.lineDiscount,
    pricingSource: null,
  }));
};
