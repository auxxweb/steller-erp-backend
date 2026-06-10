import asyncHandler from '../utils/asyncHandler.js';
import * as rentalService from '../services/rentalService.js';
import * as rentalWorkflow from '../services/workflow/rentalWorkflowService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const stats = asyncHandler(async (req, res) => {
  const stats = await rentalService.getRentalStats(req.user, req.query);
  res.status(200).json({ success: true, data: { stats } });
});

export const list = asyncHandler(async (req, res) => {
  const result = await rentalService.listRentals(req.query, req.user);
  res.status(200).json({
    success: true,
    count: result.rentals.length,
    data: result,
  });
});

export const checkAvailability = asyncHandler(async (req, res) => {
  const result = await rentalWorkflow.workflowCheckAvailability(req.body, req.user);
  res.status(200).json({ success: true, data: result });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await rentalService.getRentalById(req.params.id, req.user);
  res.status(200).json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowCreateRental(req.body, req.user, auditMeta(req));

  res.status(201).json({
    success: true,
    message: 'Rental booking created',
    data,
  });
});

export const update = asyncHandler(async (req, res) => {
  const data = await rentalService.updateRental(req.params.id, req.body, req.user);
  res.status(200).json({
    success: true,
    message: 'Rental updated',
    data,
  });
});

export const reserve = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowReserveRental(
    req.params.id,
    req.user,
    { ttlMinutes: req.body.reservationTtlMinutes },
    auditMeta(req),
  );

  res.status(200).json({
    success: true,
    message: 'Inventory reserved',
    data,
  });
});

export const confirm = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowConfirmRental(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: 'Booking confirmed',
    data,
  });
});

export const timeline = asyncHandler(async (req, res) => {
  const entries = await rentalWorkflow.getRentalWorkflowTimeline(req.params.id);
  res.status(200).json({ success: true, data: { timeline: entries } });
});

export const pickup = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowPickupRental(
    req.params.id,
    req.user,
    req.body,
    auditMeta(req),
  );

  res.status(200).json({
    success: true,
    message: 'Pickup completed',
    data,
  });
});

export const activate = asyncHandler(async (req, res) => {
  const data = await rentalService.activateRental(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: 'Rental activated',
    data,
  });
});

export const returnRental = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowReturnRental(
    req.params.id,
    req.user,
    req.body,
    auditMeta(req),
  );

  res.status(200).json({
    success: true,
    message: data.partial ? 'Partial return recorded' : 'Return completed',
    data,
  });
});

export const maintenance = asyncHandler(async (req, res) => {
  const data = await rentalService.enterRentalMaintenance(req.params.id, req.user, req.body);
  res.status(200).json({
    success: true,
    message: 'Rental marked for maintenance',
    data,
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowCancelRental(
    req.params.id,
    req.user,
    req.body.reason,
    auditMeta(req),
  );

  res.status(200).json({
    success: true,
    message: 'Rental cancelled',
    data,
  });
});

export const close = asyncHandler(async (req, res) => {
  const data = await rentalWorkflow.workflowCloseRental(
    req.params.id,
    req.user,
    { generateInvoice: req.body.generateInvoice !== false },
    auditMeta(req),
  );
  res.status(200).json({
    success: true,
    message: 'Rental closed',
    data,
  });
});
