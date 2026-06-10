import asyncHandler from '../utils/asyncHandler.js';
import * as auditService from '../services/auditService.js';

export const list = asyncHandler(async (req, res) => {
  const data = await auditService.listAuditLogs(req.user, req.query);
  res.status(200).json({ success: true, data });
});
