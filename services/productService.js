import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Category from '../models/Category.js';
import Branch from '../models/Branch.js';
import { ensureCommonInventoryBranch } from './branchService.js';
import {
  INVENTORY_SCOPE,
  PRODUCT_HISTORY_ACTION,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_UNIT_STATUS,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';
import { logProductHistory, listProductHistory } from './productHistoryService.js';

const PRODUCT_POPULATE = [
  { path: 'branch', select: 'name code' },
  { path: 'category', select: 'name slug status' },
  { path: 'branchLocations.branch', select: 'name code' },
];

const resolveProductBranch = async (actor, payload) => {
  const wantsBranch =
    payload.inventoryScope === INVENTORY_SCOPE.BRANCH && payload.branch;

  if (wantsBranch) {
    const branchId =
      actor.role === ROLES.SUPER_ADMIN
        ? payload.branch
        : resolveBranchId(actor, payload.branch);
    return { branchId, inventoryScope: INVENTORY_SCOPE.BRANCH };
  }

  const commonBranch = await ensureCommonInventoryBranch(actor._id);
  return { branchId: commonBranch._id, inventoryScope: INVENTORY_SCOPE.COMMON };
};

const normalizeBranchLocations = (locations) => {
  if (!locations) return undefined;
  if (!Array.isArray(locations)) return undefined;
  return locations
    .filter((loc) => loc?.branch)
    .map((loc) => ({
      branch: loc.branch,
      locationLabel: loc.locationLabel?.trim() || undefined,
      quantity: loc.quantity != null ? Math.max(0, Number(loc.quantity)) : 0,
      notes: loc.notes?.trim() || undefined,
    }));
};

const formatProduct = (doc) => doc.toPublicJSON();

export const resolveBranchId = (actor, branchFromPayload) => {
  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    if (!actor.branch) {
      throw new AppError('No branch assigned to your account', 403);
    }
    return actor.branch;
  }

  if (actor.role === ROLES.SUPER_ADMIN) {
    if (!branchFromPayload) {
      throw new AppError('branch is required for this operation', 400);
    }
    return branchFromPayload;
  }

  throw new AppError('You do not have permission for this action', 403);
};

const buildProductFilter = (_actor, query = {}) => {
  const filter = {};

  // Shared catalog: only filter by branch when explicitly requested (e.g. super-admin filter).
  if (query.branch) {
    filter.branch = query.branch;
  }

  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.inventoryScope) filter.inventoryScope = query.inventoryScope;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { name: regex },
      { sku: regex },
      { 'specs.brand': regex },
      { 'specs.model': regex },
      { tags: regex },
    ];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

const normalizeProductPayload = (payload) => {
  const data = { ...payload };

  if (payload.brand !== undefined || payload.model !== undefined) {
    data.specs = {
      ...(payload.specs || {}),
      brand: payload.brand?.trim() ?? payload.specs?.brand,
      model: payload.model?.trim() ?? payload.specs?.model,
    };
  }

  return data;
};

const generateSku = async (branchId, name) => {
  const prefix = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  let sku = `${prefix || 'PRD'}-${random}`;
  let attempt = 0;

  while (attempt < 5) {
    const exists = await Product.findOne({ branch: branchId, sku });
    if (!exists) return sku;
    sku = `${prefix || 'PRD'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    attempt += 1;
  }

  return `PRD-${Date.now().toString(36).toUpperCase()}`;
};

const assertCategoryForBranch = async (categoryId) => {
  const category = await Category.findById(categoryId);
  if (!category) throw new AppError('Category not found', 404);
  return category;
};

export const getInventoryStats = async (actor, query = {}) => {
  const filter = buildProductFilter(actor, query);

  const [productStats, unitStats] = await Promise.all([
    Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalUnits: { $sum: '$totalUnits' },
          availableUnits: { $sum: '$availableUnits' },
        },
      },
    ]),
    ProductUnit.aggregate([
      { $match: query.branch ? { branch: query.branch } : {} },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const productsByStatus = Object.values(PRODUCT_STATUS).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  let totalProducts = 0;
  let totalUnits = 0;
  let availableUnits = 0;

  productStats.forEach(({ _id, count, totalUnits: tu, availableUnits: au }) => {
    if (_id) productsByStatus[_id] = count;
    totalProducts += count;
    totalUnits += tu || 0;
    availableUnits += au || 0;
  });

  const unitsByStatus = Object.values(PRODUCT_UNIT_STATUS).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  unitStats.forEach(({ _id, count }) => {
    if (_id) unitsByStatus[_id] = count;
  });

  return {
    products: { total: totalProducts, byStatus: productsByStatus, totalUnits, availableUnits },
    units: { byStatus: unitsByStatus },
  };
};

export const listProducts = async (query, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  const filter = buildProductFilter(actor, query);

  const [products, total] = await Promise.all([
    Product.find(filter).populate(PRODUCT_POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  return {
    products: products.map(formatProduct),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getProductById = async (id, actor) => {
  const product = await Product.findById(id).populate(PRODUCT_POPULATE);

  if (!product) throw new AppError('Product not found', 404);

  return product;
};

export const getProductAvailability = async (id, actor) => {
  const product = await getProductById(id, actor);

  const byStatus = await ProductUnit.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const breakdown = Object.values(PRODUCT_UNIT_STATUS).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  byStatus.forEach(({ _id, count }) => {
    if (_id) breakdown[_id] = count;
  });

  const available = breakdown[PRODUCT_UNIT_STATUS.AVAILABLE] || 0;
  const rented = breakdown[PRODUCT_UNIT_STATUS.RENTED] || 0;
  const reserved = breakdown[PRODUCT_UNIT_STATUS.RESERVED] || 0;
  const inMaintenance = breakdown[PRODUCT_UNIT_STATUS.MAINTENANCE] || 0;

  return {
    product: formatProduct(product),
    availability: {
      available,
      rented,
      reserved,
      inMaintenance,
      totalUnits: product.totalUnits,
      availableUnits: product.availableUnits,
      isAvailable: available > 0 && product.status === PRODUCT_STATUS.ACTIVE,
      byStatus: breakdown,
    },
  };
};

export const getProductHistory = async (id, actor, query = {}) => {
  const product = await getProductById(id, actor);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

  return listProductHistory({ product: product._id }, { page, limit });
};

export const createProduct = async (payload, actor) => {
  const normalized = normalizeProductPayload(payload);
  const { branchId, inventoryScope } = await resolveProductBranch(actor, payload);

  const branch = await Branch.findById(branchId);
  if (!branch) throw new AppError('Branch not found', 404);

  await assertCategoryForBranch(normalized.category);

  const sku =
    normalized.sku?.trim().toUpperCase() ||
    (await generateSku(branchId, normalized.name));

  const duplicate = await Product.findOne({ branch: branchId, sku });
  if (duplicate) throw new AppError('SKU already exists for this branch', 409);

  const branchLocations = normalizeBranchLocations(payload.branchLocations);

  const product = await Product.create({
    name: normalized.name.trim(),
    sku,
    branch: branchId,
    inventoryScope,
    branchLocations: branchLocations || [],
    category: normalized.category,
    description: normalized.description?.trim(),
    type: normalized.type || PRODUCT_TYPE.RENTAL,
    status: normalized.status || PRODUCT_STATUS.ACTIVE,
    trackUnits: normalized.trackUnits !== false && normalized.type !== PRODUCT_TYPE.SALE,
    pricing: normalized.pricing || {},
    specs: {
      brand: normalized.brand?.trim() || normalized.specs?.brand,
      model: normalized.model?.trim() || normalized.specs?.model,
      serializable: normalized.specs?.serializable !== false,
      attributes: normalized.specs?.attributes,
    },
    images: normalized.images || [],
    tags: normalized.tags || [],
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await product.populate(PRODUCT_POPULATE);

  await logProductHistory({
    product: product._id,
    branch: branchId,
    action: PRODUCT_HISTORY_ACTION.PRODUCT_CREATED,
    summary: `Created product ${product.sku}`,
    changes: { after: formatProduct(product) },
    performedBy: actor._id,
  });

  const serialNumbers = normalizeSerialNumbers(payload.serialNumbers);
  let unitsCreated = 0;

  if (serialNumbers.length > 0) {
    if (!product.trackUnits) {
      throw new AppError('Cannot add serial numbers when unit tracking is disabled', 400);
    }

    const { createUnitsBulk } = await import('./productUnitService.js');
    const result = await createUnitsBulk(
      product._id,
      serialNumbers.map((serialNumber) => ({ serialNumber })),
      actor,
    );
    unitsCreated = result.count;

    await product.populate(PRODUCT_POPULATE);
    const refreshed = await Product.findById(product._id);
    product.totalUnits = refreshed.totalUnits;
    product.availableUnits = refreshed.availableUnits;
  }

  product._unitsCreated = unitsCreated;
  return product;
};

/**
 * Parse serial numbers from API payload (array or newline-separated string).
 */
export const normalizeSerialNumbers = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return [...new Set(input.map((s) => String(s).trim()).filter(Boolean))];
  }
  if (typeof input === 'string') {
    return [
      ...new Set(
        input
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }
  return [];
};

export const updateProduct = async (id, payload, actor) => {
  const product = await getProductById(id, actor);
  const before = formatProduct(product);
  const normalized = normalizeProductPayload(payload);

  if (normalized.category) {
    await assertCategoryForBranch(normalized.category);
    product.category = normalized.category;
  }

  if (normalized.name !== undefined) product.name = normalized.name.trim();
  if (normalized.description !== undefined) {
    product.description = normalized.description?.trim();
  }
  if (normalized.type !== undefined) product.type = normalized.type;
  if (normalized.pricing !== undefined) product.pricing = normalized.pricing;
  if (normalized.images !== undefined) product.images = normalized.images;
  if (normalized.tags !== undefined) product.tags = normalized.tags;
  if (normalized.trackUnits !== undefined) product.trackUnits = normalized.trackUnits;

  if (normalized.brand !== undefined || normalized.model !== undefined || normalized.specs) {
    product.specs = {
      ...product.specs?.toObject?.() || product.specs || {},
      brand: normalized.brand?.trim() ?? product.specs?.brand,
      model: normalized.model?.trim() ?? product.specs?.model,
      ...normalized.specs,
    };
  }

  if (normalized.sku) {
    const sku = normalized.sku.trim().toUpperCase();
    const dup = await Product.findOne({
      branch: product.branch,
      sku,
      _id: { $ne: product._id },
    });
    if (dup) throw new AppError('SKU already exists for this branch', 409);
    product.sku = sku;
  }

  if (payload.branchLocations !== undefined) {
    product.branchLocations = normalizeBranchLocations(payload.branchLocations) || [];
  }

  if (
    actor.role === ROLES.SUPER_ADMIN &&
    (payload.inventoryScope !== undefined || payload.branch !== undefined)
  ) {
    const { branchId, inventoryScope } = await resolveProductBranch(actor, {
      branch: payload.branch ?? product.branch?._id ?? product.branch,
      inventoryScope: payload.inventoryScope ?? product.inventoryScope,
    });
    product.branch = branchId;
    product.inventoryScope = inventoryScope;
  }

  const statusChanged =
    normalized.status !== undefined && normalized.status !== product.status;

  if (normalized.status !== undefined) product.status = normalized.status;

  product.updatedBy = actor._id;
  await product.save();
  await product.populate(PRODUCT_POPULATE);

  await logProductHistory({
    product: product._id,
    branch: product.branch?._id || product.branch,
    action: statusChanged
      ? PRODUCT_HISTORY_ACTION.PRODUCT_STATUS_CHANGED
      : PRODUCT_HISTORY_ACTION.PRODUCT_UPDATED,
    summary: statusChanged
      ? `Product status changed to ${product.status}`
      : `Updated product ${product.sku}`,
    changes: { before, after: formatProduct(product) },
    performedBy: actor._id,
  });

  return product;
};

export const deleteProduct = async (id, actor) => {
  const product = await getProductById(id, actor);
  const unitCount = await ProductUnit.countDocuments({ product: product._id });

  if (unitCount > 0) {
    product.status = PRODUCT_STATUS.DISCONTINUED;
    await product.save();
    await syncProductUnitCounts(product._id);

    await logProductHistory({
      product: product._id,
      branch: product.branch?._id || product.branch,
      action: PRODUCT_HISTORY_ACTION.PRODUCT_STATUS_CHANGED,
      summary: `Product discontinued (${unitCount} units remain)`,
      performedBy: actor._id,
    });

    return {
      product: formatProduct(product),
      softDeleted: true,
      message: 'Product has units and was marked discontinued',
    };
  }

  await Product.findByIdAndDelete(product._id);

  await logProductHistory({
    product: product._id,
    branch: product.branch?._id || product.branch,
    action: PRODUCT_HISTORY_ACTION.PRODUCT_DELETED,
    summary: `Deleted product ${product.sku}`,
    performedBy: actor._id,
  });

  return {
    product: formatProduct(product),
    softDeleted: false,
    message: 'Product deleted successfully',
  };
};
