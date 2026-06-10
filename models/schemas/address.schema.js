import mongoose from 'mongoose';

export const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
  },
  { _id: false },
);

export const idProofSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['aadhaar', 'pan', 'passport', 'driving_license', 'voter_id', 'other'],
    },
    number: { type: String, trim: true, maxlength: 50 },
    documentUrl: { type: String, trim: true },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);
