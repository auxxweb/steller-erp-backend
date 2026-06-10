import Branch from '../models/Branch.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import {
  BRANCH_STATUS,
  COMMON_INVENTORY_BRANCH_CODE,
  ROLES,
  USER_STATUS,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';

const MANAGER_POPULATE = { path: 'manager', select: 'name email role status' };

const formatBranch = (doc) => doc.toPublicJSON();

export const getBranchStats = async () => {
  const [statusCounts, total] = await Promise.all([
    Branch.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Branch.countDocuments(),
  ]);

  const byStatus = Object.values(BRANCH_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return { total, byStatus };
};

export const listBranches = async (query = {}, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = {};

  if (actor.role === ROLES.BRANCH_ADMIN && actor.branch) {
    filter._id = actor.branch;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { code: regex }, { phone: regex }, { email: regex }];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');

  const sortField = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortField]: sortOrder };

  const [branches, total] = await Promise.all([
    Branch.find(filter).populate(MANAGER_POPULATE).sort(sort).skip(skip).limit(limit),
    Branch.countDocuments(filter),
  ]);

  return {
    branches: branches.map(formatBranch),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getBranchById = async (id, actor) => {
  const branch = await Branch.findById(id).populate(MANAGER_POPULATE);

  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  if (actor.role === ROLES.BRANCH_ADMIN && actor.branch?.toString() !== branch._id.toString()) {
    throw new AppError('You do not have access to this branch', 403);
  }

  return branch;
};

export const getMyBranch = async (actor) => {
  if (!actor.branch) {
    throw new AppError('No branch assigned to your account', 404);
  }

  return getBranchById(actor.branch, actor);
};

export const getBranchDashboard = async (id, actor) => {
  const branch = await getBranchById(id, actor);

  const branchId = branch._id;
  const [staffCount, productCount, customerCount] = await Promise.all([
    User.countDocuments({ branch: branchId }),
    Product.countDocuments({ branch: branchId }),
    Customer.countDocuments({ branch: branchId }),
  ]);

  return {
    branch: formatBranch(branch),
    stats: {
      staffCount,
      productCount,
      customerCount,
    },
  };
};

export const createBranch = async (payload, actor) => {
  const code = payload.code.trim().toUpperCase();
  const exists = await Branch.findOne({ code });

  if (exists) {
    throw new AppError('Branch code already exists', 409);
  }

  if (payload.manager) {
    await assertValidManager(payload.manager);
  }

  const branch = await Branch.create({
    name: payload.name.trim(),
    code,
    email: payload.email?.toLowerCase().trim() || undefined,
    phone: payload.phone?.trim(),
    address: payload.address,
    status: payload.status || BRANCH_STATUS.ACTIVE,
    manager: payload.manager || null,
    createdBy: actor._id,
  });

  await branch.populate(MANAGER_POPULATE);
  return branch;
};

export const updateBranch = async (id, payload, actor) => {
  const branch = await getBranchById(id, actor);

  if (payload.code) {
    const code = payload.code.trim().toUpperCase();
    const duplicate = await Branch.findOne({ code, _id: { $ne: branch._id } });
    if (duplicate) {
      throw new AppError('Branch code already exists', 409);
    }
    branch.code = code;
  }

  if (payload.name !== undefined) branch.name = payload.name.trim();
  if (payload.email !== undefined) branch.email = payload.email?.toLowerCase().trim() || undefined;
  if (payload.phone !== undefined) branch.phone = payload.phone?.trim();
  if (payload.address !== undefined) branch.address = payload.address;
  if (payload.status !== undefined) branch.status = payload.status;

  if (payload.manager !== undefined) {
    if (payload.manager) {
      await assertValidManager(payload.manager, branch._id);
    }
    branch.manager = payload.manager || null;
  }

  await branch.save();
  await branch.populate(MANAGER_POPULATE);
  return branch;
};

export const deleteBranch = async (id, actor) => {
  const branch = await getBranchById(id, actor);

  const branchId = branch._id;
  const [users, products, customers] = await Promise.all([
    User.countDocuments({ branch: branchId }),
    Product.countDocuments({ branch: branchId }),
    Customer.countDocuments({ branch: branchId }),
  ]);

  if (users > 0 || products > 0 || customers > 0) {
    branch.status = BRANCH_STATUS.CLOSED;
    await branch.save();
    return {
      branch: formatBranch(branch),
      softDeleted: true,
      message:
        'Branch has linked records and was marked as closed instead of deleted.',
    };
  }

  await Branch.findByIdAndDelete(branchId);
  return {
    branch: formatBranch(branch),
    softDeleted: false,
    message: 'Branch deleted successfully',
  };
};

const assertValidManager = async (managerId, branchId = null) => {
  const manager = await User.findById(managerId);

  if (!manager) {
    throw new AppError('Manager user not found', 404);
  }

  const isBranchManager =
    manager.role === ROLES.BRANCH_ADMIN ||
    manager.role === ROLES.SUPER_ADMIN ||
    (manager.role === ROLES.EMPLOYEE && manager.employeePosition === 'branch_manager');

  if (!isBranchManager) {
    throw new AppError('Manager must be a branch admin or a branch_manager employee', 400);
  }

  if (branchId && manager.branch && manager.branch.toString() !== branchId.toString()) {
    throw new AppError('Manager must belong to this branch', 400);
  }
};

export const listBranchManagers = async () => {
  const users = await User.find({
    status: USER_STATUS.ACTIVE,
    $or: [
      { role: { $in: [ROLES.BRANCH_ADMIN, ROLES.SUPER_ADMIN] } },
      { role: ROLES.EMPLOYEE, employeePosition: 'branch_manager' },
    ],
  })
    .select('name email role branch employeePosition')
    .sort({ name: 1 });

  return users.map((u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    employeePosition: u.employeePosition,
    branch: u.branch,
  }));
};

/**
 * System branch label for shared catalog rows. All products/units are rentable network-wide;
 * branch fields indicate physical location only.
 */
export const ensureCommonInventoryBranch = async (createdBy = null) => {
  let branch = await Branch.findOne({ code: COMMON_INVENTORY_BRANCH_CODE });
  if (!branch) {
    branch = await Branch.create({
      name: 'Common inventory',
      code: COMMON_INVENTORY_BRANCH_CODE,
      status: BRANCH_STATUS.ACTIVE,
      createdBy,
    });
  }
  return branch;
};
