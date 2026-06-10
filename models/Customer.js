import mongoose from 'mongoose';
import { CUSTOMER_STATUS, CUSTOMER_TYPE, RISK_LEVEL } from './constants/enums.js';
import { addressSchema, idProofSchema } from './schemas/address.schema.js';
import { idProofEntrySchema } from './schemas/idProof.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';
import { normalizeEmail, normalizePhone } from '../utils/customerIdentity.js';

const customerSchema = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true,
    },
    customerType: {
      type: String,
      enum: { values: Object.values(CUSTOMER_TYPE), message: 'Invalid customer type' },
      default: CUSTOMER_TYPE.INDIVIDUAL,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      maxlength: 20,
    },
    /** Normalized digits for global uniqueness (see customerIdentity util) */
    phoneNormalized: {
      type: String,
      trim: true,
    },
    alternatePhone: { type: String, trim: true, maxlength: 20 },
    address: addressSchema,
    idProof: idProofSchema,
    idProofs: [idProofEntrySchema],
    company: { type: String, trim: true, maxlength: 150 },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15 },
    status: {
      type: String,
      enum: { values: Object.values(CUSTOMER_STATUS), message: 'Invalid status' },
      default: CUSTOMER_STATUS.ACTIVE,
      index: true,
    },
    creditLimit: { type: Number, min: 0, default: 0 },
    outstandingBalance: { type: Number, min: 0, default: 0 },
    riskScore: { type: Number, min: 0, max: 100, default: 50 },
    riskLevel: {
      type: String,
      enum: { values: Object.values(RISK_LEVEL), message: 'Invalid risk level' },
      default: RISK_LEVEL.MEDIUM,
    },
    riskFactors: { type: mongoose.Schema.Types.Mixed, default: {} },
    riskCalculatedAt: { type: Date },
    blockedAt: { type: Date },
    blockedReason: { type: String, trim: true, maxlength: 500 },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [{ type: String, trim: true, lowercase: true }],
    notes: { type: String, trim: true, maxlength: 2000 },
    documents: [
      {
        name: { type: String, trim: true, maxlength: 150 },
        url: { type: String, trim: true },
        publicId: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

customerSchema.index({ phoneNormalized: 1 }, { unique: true, sparse: true });
customerSchema.index({ email: 1 }, { unique: true, sparse: true });
customerSchema.index({ branch: 1, phone: 1 });
customerSchema.index({ branch: 1, status: 1, name: 1 });
customerSchema.index({ name: 'text', phone: 'text', email: 'text', company: 'text' });
customerSchema.index({ branch: 1, customerType: 1, status: 1 });
customerSchema.index({ branch: 1, riskLevel: 1 });

customerSchema.pre('validate', function syncNormalizedIdentity() {
  if (this.phone) {
    this.phoneNormalized = normalizePhone(this.phone);
  }
  if (this.email === '' || this.email === null) {
    this.email = undefined;
  } else if (this.email) {
    this.email = normalizeEmail(this.email);
  }
});

customerSchema.methods.toPublicJSON = function toPublicJSON() {
  const branch = this.branch;
  return {
    id: this._id,
    customerType: this.customerType,
    name: this.name,
    email: this.email,
    phone: this.phone,
    alternatePhone: this.alternatePhone,
    address: this.address,
    idProof: this.idProof,
    idProofs: this.idProofs,
    company: this.company,
    gstin: this.gstin,
    status: this.status,
    creditLimit: this.creditLimit,
    outstandingBalance: this.outstandingBalance,
    riskScore: this.riskScore,
    riskLevel: this.riskLevel,
    riskFactors: this.riskFactors,
    riskCalculatedAt: this.riskCalculatedAt,
    isBlocked: this.status === CUSTOMER_STATUS.BLOCKED,
    blockedAt: this.blockedAt,
    blockedReason: this.blockedReason,
    tags: this.tags,
    notes: this.notes,
    documents: this.documents,
    branch:
      branch && typeof branch === 'object' && branch._id
        ? { id: branch._id, name: branch.name, code: branch.code }
        : branch,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
