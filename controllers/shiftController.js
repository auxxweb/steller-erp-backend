import asyncHandler from '../utils/asyncHandler.js';
import {
  createShift,
  listShifts,
  assignShiftsToUser,
  updateShift,
  deleteShift,
} from '../services/shiftService.js';

export const create = asyncHandler(async (req, res) => {
  const shift = await createShift(req.body, req.user);
  res.status(201).json({ success: true, data: { shift } });
});

export const list = asyncHandler(async (req, res) => {
  const data = await listShifts(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const assignToUser = asyncHandler(async (req, res) => {
  const { shiftIds } = req.body;
  const user = await assignShiftsToUser(req.params.userId, shiftIds, req.user);
  res.status(200).json({ success: true, message: 'Shift schedule updated', data: { user } });
});

export const update = asyncHandler(async (req, res) => {
  const shift = await updateShift(req.params.shiftId, req.body, req.user);
  res.status(200).json({ success: true, message: 'Shift updated', data: { shift } });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await deleteShift(req.params.shiftId, req.user);
  res.status(200).json({ success: true, message: 'Shift deleted', data: result });
});

