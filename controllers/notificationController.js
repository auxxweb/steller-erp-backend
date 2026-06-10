import asyncHandler from '../utils/asyncHandler.js';
import * as notificationService from '../services/notificationService.js';

export const list = asyncHandler(async (req, res) => {
  const result = await notificationService.listNotifications(req.user._id, req.query);
  res.status(200).json({ success: true, data: result });
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markNotificationRead(
    req.params.id,
    req.user._id,
  );
  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  res.status(200).json({ success: true, data: { notification } });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllNotificationsRead(req.user._id);
  res.status(200).json({ success: true, message: 'All notifications marked read' });
});
