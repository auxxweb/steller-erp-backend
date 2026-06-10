import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { NOTIFICATION_CHANNEL, NOTIFICATION_TYPE, ROLES, USER_STATUS } from '../models/constants/enums.js';

/**
 * Create in-app notifications for one or more users.
 */
export const createNotifications = async ({
  userIds = [],
  branchId = null,
  roles = [ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE],
  type = NOTIFICATION_TYPE.SYSTEM,
  title,
  body,
  data = {},
}) => {
  let targets = userIds;

  if (!targets?.length && branchId) {
    const users = await User.find({
      branch: branchId,
      status: USER_STATUS.ACTIVE,
      role: { $in: roles },
    })
      .select('_id')
      .lean();
    targets = users.map((u) => u._id);
  }

  if (!targets?.length) return [];

  const docs = targets.map((userId) => ({
    user: userId,
    branch: branchId,
    type,
    channel: NOTIFICATION_CHANNEL.IN_APP,
    title,
    body,
    data,
  }));

  return Notification.insertMany(docs);
};

export const listNotifications = async (userId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = { user: userId };
  if (query.unreadOnly === 'true' || query.unreadOnly === true) {
    filter.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, isRead: false }),
  ]);

  return {
    notifications: notifications.map((n) => ({
      id: n._id,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      readAt: n.readAt,
      data: n.data,
      createdAt: n.createdAt,
    })),
    unreadCount,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const markNotificationRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true, readAt: new Date() },
    { new: true },
  ).lean();

  return notification
    ? {
        id: notification._id,
        isRead: notification.isRead,
        readAt: notification.readAt,
      }
    : null;
};

export const markAllNotificationsRead = async (userId) => {
  await Notification.updateMany(
    { user: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  return { success: true };
};

export const notifyTransferEvent = async ({
  transfer,
  title,
  body,
  notifyFromBranch = false,
  notifyToBranch = false,
}) => {
  const entityId = transfer._id || transfer.id;
  const data = {
    entity: 'Transfer',
    entityId,
    url: `/transfers/${entityId}`,
    payload: { transferNumber: transfer.transferNumber, status: transfer.status },
  };

  const tasks = [];

  if (notifyFromBranch && transfer.fromBranch) {
    const branchId = transfer.fromBranch._id || transfer.fromBranch;
    tasks.push(
      createNotifications({
        branchId,
        type: NOTIFICATION_TYPE.TRANSFER,
        title,
        body,
        data,
      }),
    );
  }

  if (notifyToBranch && transfer.toBranch) {
    const branchId = transfer.toBranch._id || transfer.toBranch;
    tasks.push(
      createNotifications({
        branchId,
        type: NOTIFICATION_TYPE.TRANSFER,
        title,
        body,
        data,
      }),
    );
  }

  await Promise.all(tasks);
};
