import asyncHandler from '../utils/asyncHandler.js';
import * as settingsService from '../services/settingsService.js';

export const getWorkspace = asyncHandler(async (req, res) => {
  const data = await settingsService.getWorkspaceSettings(req.user);
  res.status(200).json({ success: true, data });
});

export const updateBranch = asyncHandler(async (req, res) => {
  const branch = await settingsService.updateBranchSettings(req.user, req.body);
  res.status(200).json({
    success: true,
    message: 'Branch settings saved',
    data: { branch },
  });
});
