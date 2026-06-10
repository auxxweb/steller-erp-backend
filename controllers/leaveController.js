import asyncHandler from '../utils/asyncHandler.js';
import * as leaveService from '../services/leaveService.js';

export const apply = asyncHandler(async (req, res) => {
  const leave = await leaveService.applyLeave(req.user, req.body);
  res.status(201).json({ success: true, message: 'Leave request submitted', data: { leave } });
});

export const listMine = asyncHandler(async (req, res) => {
  const leaves = await leaveService.listMyLeaves(req.user, req.query);
  res.status(200).json({ success: true, count: leaves.length, data: { leaves } });
});

export const listForApproval = asyncHandler(async (req, res) => {
  const leaves = await leaveService.listLeavesForApproval(req.user, req.query);
  res.status(200).json({ success: true, count: leaves.length, data: { leaves } });
});

export const approve = asyncHandler(async (req, res) => {
  const leave = await leaveService.approveLeave(req.user, req.params.leaveId);
  res.status(200).json({ success: true, message: 'Leave approved', data: { leave } });
});

export const reject = asyncHandler(async (req, res) => {
  const leave = await leaveService.rejectLeave(req.user, req.params.leaveId, req.body.rejectionReason);
  res.status(200).json({ success: true, message: 'Leave rejected', data: { leave } });
});
