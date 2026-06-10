import { createNotifications } from '../notificationService.js';
import { NOTIFICATION_TYPE } from '../../models/constants/enums.js';

export const notifyRentalEvent = async ({
  rental,
  title,
  body,
  extraUserIds = [],
}) => {
  const branchId = rental.branch?._id || rental.branch;
  const userIds = [
    rental.handledBy?._id || rental.handledBy,
    rental.deliveryStaff?._id || rental.deliveryStaff,
    ...extraUserIds,
  ].filter(Boolean);

  return createNotifications({
    userIds: [...new Set(userIds.map((id) => id.toString()))],
    branchId,
    type: NOTIFICATION_TYPE.RENTAL,
    title,
    body,
    data: {
      rentalId: rental._id?.toString() || rental.id,
      rentalNumber: rental.rentalNumber,
      status: rental.status,
    },
  });
};

export const notifyPaymentEvent = async ({ branchId, customerId, title, body, data = {} }) =>
  createNotifications({
    branchId,
    type: NOTIFICATION_TYPE.PAYMENT,
    title,
    body,
    data: { ...data, customerId },
  });

export const notifyMaintenanceEvent = async ({ branchId, title, body, data = {} }) =>
  createNotifications({
    branchId,
    type: NOTIFICATION_TYPE.MAINTENANCE,
    title,
    body,
    data,
  });
