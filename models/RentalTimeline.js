import mongoose from 'mongoose';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const rentalTimelineSchema = new mongoose.Schema(
  {
    rental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    fromStatus: { type: String, trim: true },
    toStatus: { type: String, trim: true },
    summary: { type: String, trim: true, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  defaultSchemaOptions,
);

rentalTimelineSchema.index({ rental: 1, createdAt: -1 });

const RentalTimeline = mongoose.model('RentalTimeline', rentalTimelineSchema);

export default RentalTimeline;
