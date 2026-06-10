import Customer from '../models/Customer.js';
import Guarantor from '../models/Guarantor.js';
import Rental from '../models/Rental.js';
import Branch from '../models/Branch.js';
import {
  CUSTOMER_STATUS,
  CUSTOMER_TYPE,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import { computeRiskScore } from '../utils/riskScore.js';
import { uploadCustomerDocuments } from './uploadService.js';
import {
  normalizeEmail,
  normalizePhone,
  phonesMatch,
} from '../utils/customerIdentity.js';

const CUSTOMER_POPULATE = { path: 'branch', select: 'name code' };

const formatCustomer = (doc) => doc.toPublicJSON();

const duplicateIdentityMessage = (existing, field) => {
  const branchLabel =
    existing.branch?.name || existing.branch?.code
      ? ` (${existing.branch.name || existing.branch.code})`
      : '';
  return `A customer with this ${field} already exists: ${existing.name}${branchLabel}. Use the existing profile instead of creating a duplicate.`;
};

const findCustomerByPhone = async (phone, excludeCustomerId) => {
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return null;

  const filter = excludeCustomerId ? { _id: { $ne: excludeCustomerId } } : {};

  const byNormalized = await Customer.findOne({ ...filter, phoneNormalized: phoneNorm })
    .populate(CUSTOMER_POPULATE)
    .select('name phone email branch');
  if (byNormalized) return byNormalized;

  if (phoneNorm.length >= 10) {
    const escaped = phoneNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byLegacyPhone = await Customer.findOne({
      ...filter,
      phone: { $regex: new RegExp(`${escaped}$`) },
    })
      .populate(CUSTOMER_POPULATE)
      .select('name phone email branch');
    if (byLegacyPhone) return byLegacyPhone;
  }

  return null;
};

const findCustomerByEmail = async (email, excludeCustomerId) => {
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) return null;

  const filter = {
    email: emailNorm,
    ...(excludeCustomerId ? { _id: { $ne: excludeCustomerId } } : {}),
  };

  return Customer.findOne(filter).populate(CUSTOMER_POPULATE).select('name phone email branch');
};

const assertCustomerIdentityUnique = async ({
  phone,
  email,
  alternatePhone,
  excludeCustomerId,
}) => {
  const phoneDup = await findCustomerByPhone(phone, excludeCustomerId);
  if (phoneDup) {
    throw new AppError(duplicateIdentityMessage(phoneDup, 'phone number'), 409);
  }

  if (alternatePhone?.trim()) {
    const altDup = await findCustomerByPhone(alternatePhone, excludeCustomerId);
    if (altDup && !phonesMatch(altDup.phone, phone)) {
      throw new AppError(duplicateIdentityMessage(altDup, 'alternate phone'), 409);
    }
  }

  const emailDup = await findCustomerByEmail(email, excludeCustomerId);
  if (emailDup) {
    throw new AppError(duplicateIdentityMessage(emailDup, 'email'), 409);
  }
};

export const resolveBranchId = (actor, branchFromPayload) => {
  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    if (!actor.branch) throw new AppError('No branch assigned to your account', 403);
    return actor.branch;
  }
  if (actor.role === ROLES.SUPER_ADMIN) {
    if (!branchFromPayload) throw new AppError('branch is required', 400);
    return branchFromPayload;
  }
  throw new AppError('You do not have permission for this action', 403);
};

const buildCustomerFilter = (actor, query = {}) => {
  const filter = {};

  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    filter.branch = actor.branch;
  } else if (query.branch) {
    filter.branch = query.branch;
  }

  if (query.status) filter.status = query.status;
  if (query.customerType) filter.customerType = query.customerType;
  if (query.riskLevel) filter.riskLevel = query.riskLevel;

  if (query.blocked === 'true') filter.status = CUSTOMER_STATUS.BLOCKED;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { name: regex },
      { phone: regex },
      { email: regex },
      { company: regex },
      { gstin: regex },
    ];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

const syncPrimaryIdProof = (customer) => {
  const primary =
    customer.idProofs?.find((p) => p.isPrimary) || customer.idProofs?.[0];
  if (primary) {
    customer.idProof = {
      type: primary.type,
      number: primary.number,
      documentUrl: primary.documentUrl,
      verifiedAt: primary.verifiedAt,
      verifiedBy: primary.verifiedBy,
    };
  }
};

export const recalculateCustomerRisk = async (customerId, actor) => {
  const customer = await getCustomerById(customerId, actor, { lean: true });
  const [rentals, guarantorCount] = await Promise.all([
    Rental.find({ customer: customer._id }).select('status').lean(),
    Guarantor.countDocuments({ customer: customer._id }),
  ]);

  const customerDoc = await Customer.findById(customer._id);
  const result = computeRiskScore({
    customer: customerDoc,
    rentals,
    guarantorCount,
  });

  customerDoc.riskScore = result.score;
  customerDoc.riskLevel = result.level;
  customerDoc.riskFactors = result.factors;
  customerDoc.riskCalculatedAt = new Date();
  await customerDoc.save();
  await customerDoc.populate(CUSTOMER_POPULATE);

  return {
    riskScore: result.score,
    riskLevel: result.level,
    riskFactors: result.factors,
    calculatedAt: customerDoc.riskCalculatedAt,
  };
};

export const getCustomerStats = async (actor, query = {}) => {
  const filter = buildCustomerFilter(actor, query);

  const [statusCounts, typeCounts, riskCounts, total] = await Promise.all([
    Customer.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Customer.aggregate([
      { $match: filter },
      { $group: { _id: '$customerType', count: { $sum: 1 } } },
    ]),
    Customer.aggregate([
      { $match: filter },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]),
    Customer.countDocuments(filter),
  ]);

  const byStatus = Object.values(CUSTOMER_STATUS).reduce((a, s) => ({ ...a, [s]: 0 }), {});
  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  const byType = Object.values(CUSTOMER_TYPE).reduce((a, t) => ({ ...a, [t]: 0 }), {});
  typeCounts.forEach(({ _id, count }) => {
    if (_id) byType[_id] = count;
  });

  const byRiskLevel = { low: 0, medium: 0, high: 0 };
  riskCounts.forEach(({ _id, count }) => {
    if (_id) byRiskLevel[_id] = count;
  });

  return { total, byStatus, byType, byRiskLevel };
};

export const lookupCustomerIdentity = async ({ phone, email }, actor, { excludeCustomerId } = {}) => {
  const phoneMatch = phone ? await findCustomerByPhone(phone, excludeCustomerId) : null;
  const emailMatch = email ? await findCustomerByEmail(email, excludeCustomerId) : null;

  return {
    phoneAvailable: !phoneMatch,
    emailAvailable: !emailMatch,
    phoneMatch: phoneMatch ? formatCustomer(phoneMatch) : null,
    emailMatch: emailMatch ? formatCustomer(emailMatch) : null,
  };
};

export const listCustomers = async (query, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  const filter = buildCustomerFilter(actor, query);
  const sortField = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [customers, total] = await Promise.all([
    Customer.find(filter).populate(CUSTOMER_POPULATE).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);

  return {
    customers: customers.map(formatCustomer),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getCustomerById = async (id, actor, { lean = false } = {}) => {
  const q = Customer.findById(id).populate(CUSTOMER_POPULATE);
  const customer = lean ? await q.lean() : await q;

  if (!customer) throw new AppError('Customer not found', 404);

  const branchId = customer.branch?._id?.toString() || customer.branch?.toString();
  if (
    (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) &&
    branchId !== actor.branch?.toString()
  ) {
    throw new AppError('You do not have access to this customer', 403);
  }

  return customer;
};

export const createCustomer = async (payload, actor) => {
  const branchId = resolveBranchId(actor, payload.branch);
  const branch = await Branch.findById(branchId);
  if (!branch) throw new AppError('Branch not found', 404);

  const customerType = payload.customerType || CUSTOMER_TYPE.INDIVIDUAL;
  if (customerType === CUSTOMER_TYPE.BUSINESS && !payload.company?.trim()) {
    throw new AppError('Company name is required for business customers', 400);
  }

  await assertCustomerIdentityUnique({
    phone: payload.phone,
    email: payload.email,
    alternatePhone: payload.alternatePhone,
  });

  const phoneNorm = normalizePhone(payload.phone);
  const emailNorm = normalizeEmail(payload.email);

  let customer;
  try {
    customer = await Customer.create({
      branch: branchId,
      customerType,
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      phoneNormalized: phoneNorm,
      alternatePhone: payload.alternatePhone?.trim(),
      email: emailNorm,
      address: payload.address,
      company: payload.company?.trim(),
      gstin: payload.gstin?.trim()?.toUpperCase(),
      status: payload.status || CUSTOMER_STATUS.ACTIVE,
      creditLimit: payload.creditLimit ?? 0,
      notes: payload.notes?.trim(),
      tags: payload.tags || [],
      idProof: payload.idProof,
      idProofs: payload.idProofs || (payload.idProof ? [{ ...payload.idProof, isPrimary: true }] : []),
      createdBy: actor._id,
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern?.email ? 'email' : 'phone number';
      throw new AppError(
        `A customer with this ${field} already exists. Search for the existing profile instead.`,
        409,
      );
    }
    throw err;
  }

  syncPrimaryIdProof(customer);
  await customer.save();
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return customer;
};

export const updateCustomer = async (id, payload, actor) => {
  const customer = await getCustomerById(id, actor);

  const nextPhone = payload.phone !== undefined ? payload.phone.trim() : customer.phone;
  const nextEmail = payload.email !== undefined ? payload.email : customer.email;
  const nextAlt =
    payload.alternatePhone !== undefined ? payload.alternatePhone : customer.alternatePhone;

  if (
    payload.phone !== undefined ||
    payload.email !== undefined ||
    payload.alternatePhone !== undefined
  ) {
    await assertCustomerIdentityUnique({
      phone: nextPhone,
      email: nextEmail,
      alternatePhone: nextAlt,
      excludeCustomerId: customer._id,
    });
  }

  if (payload.phone) {
    customer.phone = payload.phone.trim();
    customer.phoneNormalized = normalizePhone(payload.phone);
  }

  if (payload.name !== undefined) customer.name = payload.name.trim();
  if (payload.alternatePhone !== undefined) customer.alternatePhone = payload.alternatePhone?.trim();
  if (payload.email !== undefined) customer.email = normalizeEmail(payload.email);
  if (payload.address !== undefined) customer.address = payload.address;
  if (payload.customerType !== undefined) customer.customerType = payload.customerType;
  if (payload.company !== undefined) customer.company = payload.company?.trim();
  if (payload.gstin !== undefined) customer.gstin = payload.gstin?.trim()?.toUpperCase();
  if (payload.creditLimit !== undefined) customer.creditLimit = payload.creditLimit;
  if (payload.outstandingBalance !== undefined) {
    customer.outstandingBalance = payload.outstandingBalance;
  }
  if (payload.notes !== undefined) customer.notes = payload.notes?.trim();
  if (payload.tags !== undefined) customer.tags = payload.tags;
  if (payload.idProof !== undefined) customer.idProof = payload.idProof;
  if (payload.idProofs !== undefined) {
    customer.idProofs = payload.idProofs;
    syncPrimaryIdProof(customer);
  }

  if (payload.status !== undefined && payload.status !== CUSTOMER_STATUS.BLOCKED) {
    customer.status = payload.status;
    if (customer.status !== CUSTOMER_STATUS.BLOCKED) {
      customer.blockedAt = undefined;
      customer.blockedReason = undefined;
      customer.blockedBy = undefined;
    }
  }

  try {
    await customer.save();
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern?.email ? 'email' : 'phone number';
      throw new AppError(
        `A customer with this ${field} already exists. Search for the existing profile instead.`,
        409,
      );
    }
    throw err;
  }
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return customer;
};

export const deleteCustomer = async (id, actor) => {
  const customer = await getCustomerById(id, actor);
  const activeRentals = await Rental.countDocuments({
    customer: customer._id,
    status: {
      $in: ['reserved', 'picked_up', 'active', 'overdue', 'maintenance'],
    },
  });

  if (activeRentals > 0) {
    customer.status = CUSTOMER_STATUS.INACTIVE;
    await customer.save();
    return {
      customer: formatCustomer(customer),
      softDeleted: true,
      message: 'Customer has active rentals and was marked inactive',
    };
  }

  await Guarantor.deleteMany({ customer: customer._id });
  await Customer.findByIdAndDelete(customer._id);

  return {
    customer: formatCustomer(customer),
    softDeleted: false,
    message: 'Customer deleted successfully',
  };
};

export const blockCustomer = async (id, reason, actor) => {
  const customer = await getCustomerById(id, actor);

  customer.status = CUSTOMER_STATUS.BLOCKED;
  customer.blockedAt = new Date();
  customer.blockedReason = reason.trim();
  customer.blockedBy = actor._id;

  await customer.save();
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return customer;
};

export const unblockCustomer = async (id, actor) => {
  const customer = await getCustomerById(id, actor);

  if (customer.status !== CUSTOMER_STATUS.BLOCKED) {
    throw new AppError('Customer is not blocked', 400);
  }

  customer.status = CUSTOMER_STATUS.ACTIVE;
  customer.blockedAt = undefined;
  customer.blockedReason = undefined;
  customer.blockedBy = undefined;

  await customer.save();
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return customer;
};

export const getCustomerRentals = async (id, actor, query = {}) => {
  const customer = await getCustomerById(id, actor);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = { customer: customer._id };
  if (query.status) filter.status = query.status;
  applyDatePeriodFilter(filter, query, 'createdAt');

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.rentalNumber = regex;
  }

  const [rentals, total] = await Promise.all([
    Rental.find(filter)
      .select('rentalNumber status scheduledStartAt scheduledEndAt actualStartAt actualEndAt amounts createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Rental.countDocuments(filter),
  ]);

  return {
    rentals,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const uploadIdProofs = async (customerId, files, meta, actor) => {
  const customer = await getCustomerById(customerId, actor);
  const uploadResult = await uploadCustomerDocuments(files, actor, {
    branchId: customer.branch?._id || customer.branch,
    customerId: customer._id,
  });

  const newProofs = uploadResult.uploaded.map((file, i) => ({
    type: meta.type,
    number: meta.number,
    documentUrl: file.url,
    publicId: file.publicId,
    mimeType: file.mimeType || files[i]?.mimetype,
    isPrimary: Boolean(meta.isPrimary) || customer.idProofs?.length === 0,
    uploadedAt: new Date(),
  }));

  if (!customer.idProofs) customer.idProofs = [];

  if (meta.isPrimary) {
    customer.idProofs.forEach((p) => {
      p.isPrimary = false;
    });
  }

  customer.idProofs.push(...newProofs);
  customer.documents.push(
    ...uploadResult.uploaded.map((file, i) => ({
      name: meta.name || files[i]?.originalname || 'ID proof',
      url: file.url,
      publicId: file.publicId,
      mimeType: file.mimeType,
      uploadedAt: new Date(),
    })),
  );

  syncPrimaryIdProof(customer);
  await customer.save();
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return {
    customer: formatCustomer(customer),
    uploaded: newProofs,
    failed: uploadResult.failed,
  };
};

export const verifyIdProof = async (customerId, proofId, actor) => {
  const customer = await getCustomerById(customerId, actor);
  const proof = customer.idProofs.id(proofId);
  if (!proof) throw new AppError('ID proof not found', 404);

  proof.verifiedAt = new Date();
  proof.verifiedBy = actor._id;
  syncPrimaryIdProof(customer);
  await customer.save();
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return customer;
};

export const addIdProofMetadata = async (customerId, payload, actor) => {
  const customer = await getCustomerById(customerId, actor);
  if (!customer.idProofs) customer.idProofs = [];

  if (payload.isPrimary) {
    customer.idProofs.forEach((p) => {
      p.isPrimary = false;
    });
  }

  customer.idProofs.push({
    type: payload.type,
    number: payload.number.trim(),
    documentUrl: payload.documentUrl,
    isPrimary: Boolean(payload.isPrimary),
  });

  syncPrimaryIdProof(customer);
  await customer.save();
  await recalculateCustomerRisk(customer._id, actor);
  await customer.populate(CUSTOMER_POPULATE);

  return customer;
};
