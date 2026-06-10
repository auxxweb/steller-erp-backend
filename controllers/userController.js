import asyncHandler from '../utils/asyncHandler.js';
import * as userService from '../services/userService.js';
import { logAudit } from '../utils/auditLogger.js';
import { AUDIT_ACTION } from '../models/constants/enums.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const list = asyncHandler(async (req, res) => {
  const users = await userService.listUsers(req.user, req.query);

  res.status(200).json({
    success: true,
    count: users.length,
    data: { users },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = await userService.deleteUserPermanently(req.params.userId, req.user);

  await logAudit({
    ...auditMeta(req),
    action: AUDIT_ACTION.DELETE,
    entity: 'User',
    entityId: id,
    summary: 'Permanently deleted user account',
    metadata: { userId: id },
  });

  res.status(200).json({
    success: true,
    message: 'User permanently deleted',
    data: { id },
  });
});
