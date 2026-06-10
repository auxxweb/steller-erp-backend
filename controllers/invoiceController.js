import asyncHandler from '../utils/asyncHandler.js';
import * as invoiceService from '../services/invoiceService.js';

export const list = asyncHandler(async (req, res) => {
  const data = await invoiceService.listInvoices(req.user, req.query);
  res.status(200).json({ success: true, data });
});

export const getOne = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id, req.user);
  res.status(200).json({ success: true, data: { invoice: invoice.toPublicJSON() } });
});

export const update = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.updateInvoice(req.params.id, req.user, req.body);
  res.status(200).json({
    success: true,
    message: 'Invoice updated',
    data: { invoice: invoice.toPublicJSON() },
  });
});

export const finalize = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.finalizeInvoice(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: 'Invoice closed — no further edits allowed',
    data: { invoice: invoice.toPublicJSON() },
  });
});

export const generateFromRental = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createOrGetDraftInvoiceFromRental(
    req.params.rentalId,
    req.user,
  );
  res.status(201).json({
    success: true,
    message: 'Invoice draft created',
    data: { invoice: invoice.toPublicJSON() },
  });
});

export const getHtml = asyncHandler(async (req, res) => {
  const html = await invoiceService.getInvoiceHtml(req.params.id, req.user);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export const getWhatsAppUrl = asyncHandler(async (req, res) => {
  const url = await invoiceService.getWhatsAppShareUrl(req.params.id, req.user);
  res.status(200).json({ success: true, data: { url } });
});

export const voidInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.voidInvoice(req.params.id, req.user, req.body.reason);
  res.status(200).json({ success: true, data: { invoice: invoice.toPublicJSON() } });
});
