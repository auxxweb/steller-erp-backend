import mongoose from 'mongoose';
import { addressSchema, idProofSchema } from './schemas/address.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const guarantorSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Guarantor name is required'],
      trim: true,
      maxlength: 150,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    relationship: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    address: addressSchema,
    idProof: idProofSchema,
    isPrimary: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

guarantorSchema.index({ customer: 1, isPrimary: 1 });
guarantorSchema.index({ branch: 1, phone: 1 });

guarantorSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    customer: this.customer,
    branch: this.branch,
    name: this.name,
    phone: this.phone,
    email: this.email,
    relationship: this.relationship,
    address: this.address,
    idProof: this.idProof,
    isPrimary: this.isPrimary,
    notes: this.notes,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Guarantor = mongoose.model('Guarantor', guarantorSchema);

export default Guarantor;
