import mongoose from 'mongoose';
import { BRANCH_STATUS } from './constants/enums.js';
import { addressSchema } from './schemas/address.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: [true, 'Branch code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    phone: { type: String, trim: true, maxlength: 20 },
    address: addressSchema,
    status: {
      type: String,
      enum: { values: Object.values(BRANCH_STATUS), message: 'Invalid branch status' },
      default: BRANCH_STATUS.ACTIVE,
      index: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true },
    currency: { type: String, default: 'INR', uppercase: true, maxlength: 3 },
    settings: {
      taxRate: { type: Number, min: 0, max: 100, default: 18 },
      defaultRentalGraceHours: { type: Number, min: 0, default: 2 },
      invoicePrefix: { type: String, trim: true, default: 'INV' },
      rentalPrefix: { type: String, trim: true, default: 'RNT' },
      invoice: {
        businessName: { type: String, trim: true, maxlength: 200 },
        logoUrl: { type: String, trim: true },
        gstin: { type: String, trim: true, uppercase: true, maxlength: 15 },
        website: { type: String, trim: true },
        terms: { type: String, trim: true, maxlength: 2000 },
      },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

branchSchema.index({ status: 1, name: 1 });
branchSchema.index({ 'address.city': 1 });

branchSchema.methods.toPublicJSON = function toPublicJSON() {
  const manager = this.manager;
  const managerData =
    manager && typeof manager === 'object' && manager._id
      ? { id: manager._id, name: manager.name, email: manager.email }
      : manager || null;

  return {
    id: this._id,
    name: this.name,
    code: this.code,
    email: this.email,
    phone: this.phone,
    address: this.address,
    status: this.status,
    manager: managerData,
    timezone: this.timezone,
    currency: this.currency,
    settings: this.settings,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Branch = mongoose.model('Branch', branchSchema);

export default Branch;
