import asyncHandler from '../utils/asyncHandler.js';
import * as reportService from '../services/reportService.js';

export const rentalJobs = asyncHandler(async (req, res) => {
  const data = await reportService.getRentalJobReport(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const sales = asyncHandler(async (req, res) => {
  const data = await reportService.getSalesReport(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const exportRentalJobs = asyncHandler(async (req, res) => {
  const data = await reportService.exportRentalJobReport(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const exportSales = asyncHandler(async (req, res) => {
  const data = await reportService.exportSalesReport(req.user, req.query);
  res.status(200).json({ success: true, data });
});
