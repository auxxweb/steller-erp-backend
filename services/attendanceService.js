import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { ROLES, ATTENDANCE_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const toDateKey = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toPublicRecord = (doc) => ({
  id: doc._id.toString(),
  date: toDateKey(doc.date),
  checkInAt: doc.checkInAt || null,
  checkOutAt: doc.checkOutAt || null,
  workMinutes: doc.workMinutes ?? 0,
  status: doc.status,
});

const assertCanViewUser = async (targetUserId, actor) => {
  const user = await User.findById(targetUserId).select('branch role');
  if (!user) throw new AppError('User not found', 404);

  if (actor.role === ROLES.SUPER_ADMIN) return user;

  if (actor.role === ROLES.EMPLOYEE) {
    if (targetUserId.toString() !== actor._id.toString()) {
      throw new AppError('You can only view your own attendance', 403);
    }
    return user;
  }

  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch) throw new AppError('No branch assigned', 403);
    if (user.branch?.toString() !== actor.branch.toString()) {
      throw new AppError('You do not have access to this user', 403);
    }
  }

  return user;
};

/**
 * Record panel login as daily check-in (first login of the day).
 */
export const recordLogin = async (user) => {
  if (!user?.branch) return null;

  const date = startOfDay();
  const now = new Date();

  let record = await Attendance.findOne({ user: user._id, date });

  if (record) {
    if (!record.checkInAt) {
      record.checkInAt = now;
      record.status = ATTENDANCE_STATUS.PRESENT;
      await record.save();
    }
    return record;
  }

  record = await Attendance.create({
    user: user._id,
    branch: user.branch,
    date,
    checkInAt: now,
    status: ATTENDANCE_STATUS.PRESENT,
  });

  return record;
};

/**
 * Record panel logout as daily check-out (latest logout of the day).
 */
export const recordLogout = async (userId) => {
  const user = await User.findById(userId).select('branch');
  if (!user?.branch) return null;

  const date = startOfDay();
  const now = new Date();

  let record = await Attendance.findOne({ user: userId, date });

  if (record) {
    record.checkOutAt = now;
    await record.save();
    return record;
  }

  record = await Attendance.create({
    user: userId,
    branch: user.branch,
    date,
    checkOutAt: now,
    status: ATTENDANCE_STATUS.PRESENT,
  });

  return record;
};

/**
 * Monthly attendance calendar for a user (login / logout times per day).
 */
export const getUserAttendanceCalendar = async ({ userId, year, month, actor }) => {
  await assertCanViewUser(userId, actor);

  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const monthStart = startOfDay(new Date(y, m - 1, 1));
  const monthEnd = endOfDay(new Date(y, m, 0));

  const records = await Attendance.find({
    user: userId,
    date: { $gte: monthStart, $lte: monthEnd },
  })
    .sort({ date: 1 })
    .lean();

  return {
    year: y,
    month: m,
    records: records.map((r) => toPublicRecord(r)),
  };
};
