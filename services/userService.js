import User from '../models/User.js';
import Branch from '../models/Branch.js';
import RefreshToken from '../models/RefreshToken.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Notification from '../models/Notification.js';
import { ROLES, USER_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import { deleteAssets } from '../utils/cloudinary/delete.js';

const buildUserListFilter = (actor, query = {}) => {
  const filter = {};

  if (actor.role === ROLES.BRANCH_ADMIN) {
    filter.branch = actor.branch;
  }

  const accountStatus = query.accountStatus || 'active';
  if (accountStatus === 'deactivated') {
    filter.status = USER_STATUS.INACTIVE;
  } else {
    filter.status = { $ne: USER_STATUS.INACTIVE };
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

export const listUsers = async (actor, query = {}) => {
  const filter = buildUserListFilter(actor, query);
  const users = await User.find(filter).sort({ createdAt: -1 });
  return users.map((u) => u.toSafeJSON());
};

export const deleteUserPermanently = async (userId, actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) {
    throw new AppError('Only super admin can permanently delete users', 403);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user._id.toString() === actor._id.toString()) {
    throw new AppError('You cannot delete your own account', 400);
  }

  if (user.status !== USER_STATUS.INACTIVE) {
    throw new AppError('Only deactivated users can be permanently deleted', 400);
  }

  if (user.role === ROLES.SUPER_ADMIN) {
    const otherSuperAdmins = await User.countDocuments({
      role: ROLES.SUPER_ADMIN,
      _id: { $ne: user._id },
    });
    if (otherSuperAdmins === 0) {
      throw new AppError('Cannot delete the only super admin account', 400);
    }
  }

  const docAssets = (user.documents || [])
    .filter((d) => d.publicId)
    .map((d) => ({ publicId: d.publicId }));
  if (docAssets.length) {
    try {
      await deleteAssets(docAssets);
    } catch {
      // Continue user removal even if Cloudinary cleanup fails
    }
  }

  await Promise.all([
    RefreshToken.deleteMany({ user: user._id }),
    Attendance.deleteMany({ user: user._id }),
    Leave.deleteMany({ user: user._id }),
    Notification.deleteMany({ user: user._id }),
    Branch.updateMany({ manager: user._id }, { $set: { manager: null } }),
  ]);

  await User.deleteOne({ _id: user._id });

  return { id: userId };
};
