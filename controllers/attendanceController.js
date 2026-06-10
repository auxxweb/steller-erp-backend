import asyncHandler from '../utils/asyncHandler.js';
import * as attendanceService from '../services/attendanceService.js';

export const getUserCalendar = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  const data = await attendanceService.getUserAttendanceCalendar({
    userId: req.params.userId,
    year: year || new Date().getFullYear(),
    month: month || new Date().getMonth() + 1,
    actor: req.user,
  });

  res.status(200).json({ success: true, data });
});

export const getMyCalendar = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  const data = await attendanceService.getUserAttendanceCalendar({
    userId: req.user._id,
    year: year || new Date().getFullYear(),
    month: month || new Date().getMonth() + 1,
    actor: req.user,
  });

  res.status(200).json({ success: true, data });
});
