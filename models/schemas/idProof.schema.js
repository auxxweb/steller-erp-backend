import mongoose from 'mongoose';
import { ID_PROOF_TYPE } from '../constants/enums.js';

export const idProofEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: { values: Object.values(ID_PROOF_TYPE), message: 'Invalid ID proof type' },
    },
    number: { type: String, trim: true, maxlength: 50 },
    documentUrl: { type: String, trim: true },
    publicId: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

export default idProofEntrySchema;
