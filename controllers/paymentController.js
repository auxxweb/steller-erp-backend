import asyncHandler from '../utils/asyncHandler.js';
import * as paymentService from '../services/paymentService.js';
import { recordAudit } from '../services/auditService.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const list = asyncHandler(async (req, res) => {
  const data = await paymentService.listPayments(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const payment = await paymentService.recordPayment(req.body, req.user);
  await recordAudit({
    ...auditMeta(req),
    action: 'payment',
    entity: 'Payment',
    entityId: payment._id,
    summary: `Payment ${payment.paymentNumber} — ₹${payment.amount}`,
  });
  res.status(201).json({ success: true, message: 'Payment recorded', data: { payment } });
});
