import Leave from '../models/Leave.js';
import User from '../models/User.js';
import {
  LEAVE_STATUS,
  LEAVE_TYPE,
  NOTIFICATION_TYPE,
  ROLES,
  USER_STATUS,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { createNotifications } from './notificationService.js';

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const diffDaysInclusive = (start, end) => {
  const ms = startOfDay(end) - startOfDay(start);
  return Math.max(1, Math.floor(ms / 86400000) + 1);
};

const formatLeave = (doc, userMap = {}) => {
  const u = doc.user?._id ? doc.user : userMap[doc.user?.toString()];
  const approver = doc.approvedBy?._id ? doc.approvedBy : userMap[doc.approvedBy?.toString()];
  return {
    id: doc._id.toString(),
    user: u
      ? {
          id: u._id?.toString() || u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }
      : null,
    branch: doc.branch?.toString?.() || doc.branch,
    type: doc.type,
    status: doc.status,
    startDate: doc.startDate,
    endDate: doc.endDate,
    totalDays: doc.totalDays,
    reason: doc.reason,
    approvedBy: approver
      ? { id: approver._id?.toString(), name: approver.name }
      : doc.approvedBy
        ? { id: doc.approvedBy.toString() }
        : null,
    approvedAt: doc.approvedAt,
    rejectedAt: doc.rejectedAt,
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    requiresSuperAdminApproval: u?.role === ROLES.BRANCH_ADMIN,
  };
};

const assertApplicantWithBranch = (actor) => {
  if (![ROLES.EMPLOYEE, ROLES.BRANCH_ADMIN].includes(actor.role)) {
    throw new AppError('Only staff and branch admins can apply for leave', 403);
  }
  if (!actor.branch) {
    throw new AppError('No branch assigned to your account', 403);
  }
};

const assertLeaveApprover = (actor) => {
  if (![ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN].includes(actor.role)) {
    throw new AppError('Only admins can approve leave requests', 403);
  }
};

const getApplicant = async (userId) => {
  const user = await User.findById(userId).select('role name branch');
  if (!user) throw new AppError('Applicant not found', 404);
  return user;
};

const assertCanManageLeave = async (leave, actor) => {
  const applicant = await getApplicant(leave.user);

  if (applicant.role === ROLES.BRANCH_ADMIN) {
    if (actor.role !== ROLES.SUPER_ADMIN) {
      throw new AppError('Branch admin leave requests can only be approved by super admin', 403);
    }
    return applicant;
  }

  if (actor.role === ROLES.SUPER_ADMIN) return applicant;

  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch || leave.branch.toString() !== actor.branch.toString()) {
      throw new AppError('Leave request is not in your branch', 403);
    }
    if (applicant.role !== ROLES.EMPLOYEE) {
      throw new AppError('You can only approve employee leave requests', 403);
    }
    return applicant;
  }

  throw new AppError('Access denied', 403);
};

const notifyLeaveRequest = async (leave, applicant) => {
  const title = 'Leave request pending';
  const body = `${applicant.name} requested ${leave.type} leave (${leave.totalDays} day(s))`;

  if (applicant.role === ROLES.BRANCH_ADMIN) {
    const superAdmins = await User.find({
      role: ROLES.SUPER_ADMIN,
      status: USER_STATUS.ACTIVE,
    })
      .select('_id')
      .lean();

    if (superAdmins.length) {
      await createNotifications({
        userIds: superAdmins.map((u) => u._id),
        type: NOTIFICATION_TYPE.LEAVE,
        title: `${title} (branch admin)`,
        body,
        data: { leaveId: leave._id.toString(), path: '/admin/leaves' },
      });
    }
    return;
  }

  await createNotifications({
    branchId: leave.branch,
    roles: [ROLES.BRANCH_ADMIN],
    type: NOTIFICATION_TYPE.LEAVE,
    title,
    body,
    data: { leaveId: leave._id.toString(), path: '/branch/leaves' },
  });

  const superAdmins = await User.find({
    role: ROLES.SUPER_ADMIN,
    status: USER_STATUS.ACTIVE,
  })
    .select('_id')
    .lean();

  if (superAdmins.length) {
    await createNotifications({
      userIds: superAdmins.map((u) => u._id),
      type: NOTIFICATION_TYPE.LEAVE,
      title,
      body,
      data: { leaveId: leave._id.toString(), path: '/admin/leaves' },
    });
  }
};

export const applyLeave = async (actor, payload) => {
  assertApplicantWithBranch(actor);

  const { type, startDate, endDate, reason } = payload;
  if (!type || !Object.values(LEAVE_TYPE).includes(type)) {
    throw new AppError('Valid leave type is required', 400);
  }
  if (!reason?.trim()) throw new AppError('Reason is required', 400);

  const start = startOfDay(new Date(startDate));
  const end = startOfDay(new Date(endDate));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError('Valid start and end dates are required', 400);
  }
  if (end < start) throw new AppError('End date must be on or after start date', 400);

  const leave = await Leave.create({
    user: actor._id,
    branch: actor.branch,
    type,
    startDate: start,
    endDate: end,
    totalDays: diffDaysInclusive(start, end),
    reason: reason.trim(),
    status: LEAVE_STATUS.PENDING,
  });

  await notifyLeaveRequest(leave, actor);

  const populated = await Leave.findById(leave._id).populate('user', 'name email role');
  return formatLeave(populated);
};

export const listMyLeaves = async (actor, query = {}) => {
  assertApplicantWithBranch(actor);
  const filter = { user: actor._id };
  if (query.status) filter.status = query.status;

  const leaves = await Leave.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  return leaves.map((l) => formatLeave(l));
};

export const listLeavesForApproval = async (actor, query = {}) => {
  assertLeaveApprover(actor);

  const filter = {};
  if (query.status) filter.status = query.status;
  else filter.status = LEAVE_STATUS.PENDING;

  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch) throw new AppError('No branch assigned', 403);
    filter.branch = actor.branch;
    const employeeIds = await User.find({
      branch: actor.branch,
      role: ROLES.EMPLOYEE,
      status: { $ne: USER_STATUS.INACTIVE },
    }).distinct('_id');
    filter.user = { $in: employeeIds };
  } else if (query.branch) {
    filter.branch = query.branch;
  }

  const leaves = await Leave.find(filter)
    .populate('user', 'name email role')
    .populate('approvedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return leaves.map((l) => formatLeave(l));
};

export const approveLeave = async (actor, leaveId) => {
  assertLeaveApprover(actor);

  const leave = await Leave.findById(leaveId);
  if (!leave) throw new AppError('Leave request not found', 404);
  await assertCanManageLeave(leave, actor);

  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw new AppError('Only pending leave requests can be approved', 400);
  }

  leave.status = LEAVE_STATUS.APPROVED;
  leave.approvedBy = actor._id;
  leave.approvedAt = new Date();
  leave.rejectedAt = undefined;
  leave.rejectionReason = undefined;
  await leave.save();

  await createNotifications({
    userIds: [leave.user],
    branchId: leave.branch,
    type: NOTIFICATION_TYPE.LEAVE,
    title: 'Leave approved',
    body: `Your leave request (${leave.type}) was approved.`,
    data: { leaveId: leave._id.toString() },
  });

  const populated = await Leave.findById(leave._id)
    .populate('user', 'name email role')
    .populate('approvedBy', 'name');
  return formatLeave(populated);
};

export const rejectLeave = async (actor, leaveId, rejectionReason = '') => {
  assertLeaveApprover(actor);

  const leave = await Leave.findById(leaveId);
  if (!leave) throw new AppError('Leave request not found', 404);
  await assertCanManageLeave(leave, actor);

  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw new AppError('Only pending leave requests can be rejected', 400);
  }

  leave.status = LEAVE_STATUS.REJECTED;
  leave.rejectedAt = new Date();
  leave.rejectionReason = rejectionReason?.trim() || 'Not approved';
  leave.approvedBy = actor._id;
  leave.approvedAt = new Date();
  await leave.save();

  await createNotifications({
    userIds: [leave.user],
    branchId: leave.branch,
    type: NOTIFICATION_TYPE.LEAVE,
    title: 'Leave rejected',
    body: leave.rejectionReason,
    data: { leaveId: leave._id.toString() },
  });

  const populated = await Leave.findById(leave._id)
    .populate('user', 'name email role')
    .populate('approvedBy', 'name');
  return formatLeave(populated);
};
