import asyncHandler from '../utils/asyncHandler.js';
import * as customerService from '../services/customerService.js';
import { analyzeCustomerRisk } from '../services/riskEngineService.js';
import * as guarantorService from '../services/guarantorService.js';
import { logAudit } from '../utils/auditLogger.js';

const auditMeta = (req) => ({
  user: req.user?._id,
  branch: req.user?.branch,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

export const stats = asyncHandler(async (req, res) => {
  const stats = await customerService.getCustomerStats(req.user, req.query);
  res.status(200).json({ success: true, data: { stats } });
});

export const list = asyncHandler(async (req, res) => {
  const result = await customerService.listCustomers(req.query, req.user);
  res.status(200).json({
    success: true,
    count: result.customers.length,
    data: result,
  });
});

export const lookupIdentity = asyncHandler(async (req, res) => {
  const data = await customerService.lookupCustomerIdentity(
    { phone: req.query.phone, email: req.query.email },
    req.user,
    { excludeCustomerId: req.query.excludeCustomerId },
  );
  res.status(200).json({ success: true, data });
});

export const getOne = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id, req.user);
  res.status(200).json({
    success: true,
    data: { customer: customer.toPublicJSON() },
  });
});

export const create = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body, req.user);

  await logAudit({
    ...auditMeta(req),
    action: 'create',
    entity: 'Customer',
    entityId: customer._id,
    summary: `Created customer ${customer.name}`,
  });

  res.status(201).json({
    success: true,
    message: 'Customer created successfully',
    data: { customer: customer.toPublicJSON() },
  });
});

export const update = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body, req.user);

  res.status(200).json({
    success: true,
    message: 'Customer updated successfully',
    data: { customer: customer.toPublicJSON() },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await customerService.deleteCustomer(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

export const block = asyncHandler(async (req, res) => {
  const customer = await customerService.blockCustomer(
    req.params.id,
    req.body.reason,
    req.user,
  );

  await logAudit({
    ...auditMeta(req),
    action: 'update',
    entity: 'Customer',
    entityId: customer._id,
    summary: `Blocked customer ${customer.name}`,
  });

  res.status(200).json({
    success: true,
    message: 'Customer blocked',
    data: { customer: customer.toPublicJSON() },
  });
});

export const unblock = asyncHandler(async (req, res) => {
  const customer = await customerService.unblockCustomer(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: 'Customer unblocked',
    data: { customer: customer.toPublicJSON() },
  });
});

export const getRisk = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id, req.user);
  res.status(200).json({
    success: true,
    data: {
      riskScore: customer.riskScore,
      riskLevel: customer.riskLevel,
      riskFactors: customer.riskFactors,
      riskCalculatedAt: customer.riskCalculatedAt,
    },
  });
});

export const analyzeRisk = asyncHandler(async (req, res) => {
  const analysis = await analyzeCustomerRisk(req.params.id);
  res.status(200).json({ success: true, data: { analysis } });
});

export const recalculateRisk = asyncHandler(async (req, res) => {
  const risk = await customerService.recalculateCustomerRisk(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: 'Risk score recalculated',
    data: { risk },
  });
});

export const getRentals = asyncHandler(async (req, res) => {
  const data = await customerService.getCustomerRentals(req.params.id, req.user, req.query);

  res.status(200).json({ success: true, data });
});

export const uploadIdProofs = asyncHandler(async (req, res) => {
  const result = await customerService.uploadIdProofs(
    req.params.id,
    req.files,
    {
      type: req.body.type,
      number: req.body.number,
      name: req.body.name,
      isPrimary: req.body.isPrimary === 'true' || req.body.isPrimary === true,
    },
    req.user,
  );

  res.status(201).json({
    success: true,
    message: 'ID proof uploaded',
    data: result,
  });
});

export const verifyIdProof = asyncHandler(async (req, res) => {
  const customer = await customerService.verifyIdProof(
    req.params.id,
    req.params.proofId,
    req.user,
  );

  res.status(200).json({
    success: true,
    message: 'ID proof verified',
    data: { customer: customer.toPublicJSON() },
  });
});

export const addIdProofMeta = asyncHandler(async (req, res) => {
  const customer = await customerService.addIdProofMetadata(req.params.id, req.body, req.user);

  res.status(201).json({
    success: true,
    data: { customer: customer.toPublicJSON() },
  });
});

export const listGuarantors = asyncHandler(async (req, res) => {
  const guarantors = await guarantorService.listGuarantors(req.params.id, req.user);

  res.status(200).json({
    success: true,
    count: guarantors.length,
    data: { guarantors },
  });
});

export const createGuarantor = asyncHandler(async (req, res) => {
  const guarantor = await guarantorService.createGuarantor(req.params.id, req.body, req.user);
  await customerService.recalculateCustomerRisk(req.params.id, req.user);

  res.status(201).json({
    success: true,
    message: 'Guarantor added',
    data: { guarantor: guarantor.toPublicJSON() },
  });
});

export const getGuarantor = asyncHandler(async (req, res) => {
  const guarantor = await guarantorService.getGuarantorById(
    req.params.id,
    req.params.guarantorId,
    req.user,
  );

  res.status(200).json({
    success: true,
    data: { guarantor: guarantor.toPublicJSON() },
  });
});

export const updateGuarantor = asyncHandler(async (req, res) => {
  const guarantor = await guarantorService.updateGuarantor(
    req.params.id,
    req.params.guarantorId,
    req.body,
    req.user,
  );
  await customerService.recalculateCustomerRisk(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: 'Guarantor updated',
    data: { guarantor: guarantor.toPublicJSON() },
  });
});

export const removeGuarantor = asyncHandler(async (req, res) => {
  const guarantor = await guarantorService.deleteGuarantor(
    req.params.id,
    req.params.guarantorId,
    req.user,
  );
  await customerService.recalculateCustomerRisk(req.params.id, req.user);

  res.status(200).json({
    success: true,
    message: 'Guarantor removed',
    data: { guarantor },
  });
});
