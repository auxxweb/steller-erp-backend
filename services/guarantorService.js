import Guarantor from '../models/Guarantor.js';
import AppError from '../utils/AppError.js';
import { getCustomerById } from './customerService.js';

const formatGuarantor = (doc) => doc.toPublicJSON();

export const listGuarantors = async (customerId, actor) => {
  const customer = await getCustomerById(customerId, actor);
  const guarantors = await Guarantor.find({ customer: customer._id }).sort({
    isPrimary: -1,
    name: 1,
  });
  return guarantors.map(formatGuarantor);
};

export const getGuarantorById = async (customerId, guarantorId, actor) => {
  await getCustomerById(customerId, actor);
  const guarantor = await Guarantor.findOne({ _id: guarantorId, customer: customerId });
  if (!guarantor) throw new AppError('Guarantor not found', 404);
  return guarantor;
};

export const createGuarantor = async (customerId, payload, actor) => {
  const customer = await getCustomerById(customerId, actor);

  if (payload.isPrimary) {
    await Guarantor.updateMany({ customer: customer._id }, { isPrimary: false });
  }

  const guarantor = await Guarantor.create({
    customer: customer._id,
    branch: customer.branch?._id || customer.branch,
    name: payload.name.trim(),
    phone: payload.phone.trim(),
    email: payload.email?.toLowerCase().trim(),
    relationship: payload.relationship?.trim(),
    address: payload.address,
    idProof: payload.idProof,
    isPrimary: Boolean(payload.isPrimary),
    notes: payload.notes?.trim(),
    createdBy: actor._id,
  });

  return guarantor;
};

export const updateGuarantor = async (customerId, guarantorId, payload, actor) => {
  const guarantor = await getGuarantorById(customerId, guarantorId, actor);

  if (payload.isPrimary) {
    await Guarantor.updateMany(
      { customer: customerId, _id: { $ne: guarantor._id } },
      { isPrimary: false },
    );
  }

  if (payload.name !== undefined) guarantor.name = payload.name.trim();
  if (payload.phone !== undefined) guarantor.phone = payload.phone.trim();
  if (payload.email !== undefined) guarantor.email = payload.email?.toLowerCase().trim();
  if (payload.relationship !== undefined) guarantor.relationship = payload.relationship?.trim();
  if (payload.address !== undefined) guarantor.address = payload.address;
  if (payload.idProof !== undefined) guarantor.idProof = payload.idProof;
  if (payload.isPrimary !== undefined) guarantor.isPrimary = payload.isPrimary;
  if (payload.notes !== undefined) guarantor.notes = payload.notes?.trim();

  await guarantor.save();
  return guarantor;
};

export const deleteGuarantor = async (customerId, guarantorId, actor) => {
  const guarantor = await getGuarantorById(customerId, guarantorId, actor);
  await Guarantor.findByIdAndDelete(guarantor._id);
  return formatGuarantor(guarantor);
};
