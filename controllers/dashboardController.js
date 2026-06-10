import asyncHandler from '../utils/asyncHandler.js';
import * as dashboardService from '../services/dashboardService.js';

export const getWorkspaceDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboard(req.user);
  res.status(200).json({ success: true, data });
});
