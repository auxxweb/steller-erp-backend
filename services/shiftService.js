import Shift from '../models/Shift.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import { ROLES, USER_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';

const assertShiftBranch = (shift, actor) => {
  const shiftBranchId = shift.branch?._id?.toString?.() || shift.branch?.toString?.() || shift.branch;
  if (actor.role === ROLES.SUPER_ADMIN) return;
  if (!actor.branch) throw new AppError('No branch assigned to your account', 403);
  if (String(actor.branch) !== String(shiftBranchId)) {
    throw new AppError('Access denied to this shift', 403);
  }
};

export const createShift = async (payload, actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) throw new AppError('Only super admin can create shifts', 403);
  const branchId = payload.branch || payload.branchId;
  if (!branchId) throw new AppError('branch is required', 400);

  const branch = await Branch.findById(branchId);
  if (!branch) throw new AppError('Branch not found', 404);

  const shift = await Shift.create({
    branch: branch._id,
    name: payload.name.trim(),
    startTime: payload.startTime,
    endTime: payload.endTime,
    daysOfWeek: payload.daysOfWeek || [1, 2, 3, 4, 5],
    createdBy: actor._id,
    status: payload.status || 'active',
  });

  return shift.toPublicJSON();
};

export const listShifts = async (actor, query = {}) => {
  const branchId =
    actor.role === ROLES.SUPER_ADMIN
      ? query.branch || null
      : actor.branch?.toString?.() || null;

  if (!branchId && actor.role !== ROLES.SUPER_ADMIN) {
    throw new AppError('No branch assigned to your account', 403);
  }

  const filter = { status: query.status || 'active' };
  if (branchId) filter.branch = branchId;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const [shifts, total] = await Promise.all([
    Shift.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Shift.countDocuments(filter),
  ]);

  return {
    shifts: shifts.map((s) => ({ ...s, id: s._id.toString() })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const assignShiftsToUser = async (userId, shiftIds, actor) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const isActive = user.status === USER_STATUS.ACTIVE;
  if (!isActive) throw new AppError('User is not active', 403);

  if (actor.role !== ROLES.SUPER_ADMIN) {
    if (!actor.branch) throw new AppError('No branch assigned', 403);
    if (user.branch?.toString() !== actor.branch.toString()) {
      throw new AppError('You do not have access to this user', 403);
    }
  }

  const shifts = await Shift.find({ _id: { $in: shiftIds || [] } }).select('branch status');
  const shiftIdsFound = shifts.map((s) => s._id.toString());
  const missing = (shiftIds || []).map(String).filter((id) => !shiftIdsFound.includes(id));
  if (missing.length) throw new AppError(`Some shifts not found: ${missing.join(', ')}`, 404);

  // Branch safety: all shifts must belong to the user's branch
  const userBranchId = user.branch?.toString?.() || null;
  const offBranch = shifts.find((s) => String(s.branch) !== String(userBranchId));
  if (offBranch) throw new AppError('All shifts must belong to the same branch as the user', 400);

  user.shiftIds = shiftIds || [];
  await user.save();

  return user.toSafeJSON();
};

export const updateShift = async (shiftId, payload, actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) {
    throw new AppError('Only super admin can update shifts', 403);
  }

  const shift = await Shift.findById(shiftId);
  if (!shift) throw new AppError('Shift not found', 404);

  if (payload.name?.trim()) shift.name = payload.name.trim();
  if (payload.startTime) shift.startTime = payload.startTime;
  if (payload.endTime) shift.endTime = payload.endTime;
  if (payload.daysOfWeek) shift.daysOfWeek = payload.daysOfWeek;
  if (payload.status) shift.status = payload.status;

  shift.updatedAt = new Date();
  await shift.save();

  return shift.toPublicJSON();
};

export const deleteShift = async (shiftId, actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) {
    throw new AppError('Only super admin can delete shifts', 403);
  }

  const shift = await Shift.findById(shiftId);
  if (!shift) throw new AppError('Shift not found', 404);

  shift.status = 'inactive';
  shift.updatedAt = new Date();
  await shift.save();

  await User.updateMany({ shiftIds: shift._id }, { $pull: { shiftIds: shift._id } });

  return { id: shift._id.toString() };
};

