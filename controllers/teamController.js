import asyncHandler from '../utils/asyncHandler.js';
import * as teamService from '../services/teamService.js';

export const list = asyncHandler(async (req, res) => {
  const data = await teamService.listBranchTeam(req.user, req.query);

  res.status(200).json({
    success: true,
    count: data.members.length,
    data,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await teamService.getBranchTeamMember(req.user, req.params.userId);

  res.status(200).json({
    success: true,
    data,
  });
});
