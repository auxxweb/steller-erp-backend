import mongoose from 'mongoose';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const maintenanceSchema = new mongoose.Schema(
  {
    maintenanceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    productUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductUnit',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    type: {
      type: String,
      enum: { values: Object.values(MAINTENANCE_TYPE), message: 'Invalid maintenance type' },
      default: MAINTENANCE_TYPE.CORRECTIVE,
    },
    status: {
      type: String,
      enum: { values: Object.values(MAINTENANCE_STATUS), message: 'Invalid status' },
      default: MAINTENANCE_STATUS.SCHEDULED,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 3000 },
    scheduledAt: { type: Date, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    estimatedCost: { type: Number, min: 0, default: 0 },
    actualCost: { type: Number, min: 0, default: 0 },
    vendor: { type: String, trim: true, maxlength: 150 },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    images: [
      {
        url: { type: String, trim: true },
        publicId: { type: String, trim: true },
        caption: { type: String, trim: true, maxlength: 200 },
      },
    ],
    documents: [
      {
        name: { type: String, trim: true, maxlength: 150 },
        url: { type: String, trim: true },
        publicId: { type: String, trim: true },
        mimeType: { type: String, trim: true },
      },
    ],
  },
  defaultSchemaOptions,
);

maintenanceSchema.index({ branch: 1, status: 1, scheduledAt: 1 });
maintenanceSchema.index({ productUnit: 1, status: 1 });
maintenanceSchema.index({ assignedTo: 1, status: 1 });

const Maintenance = mongoose.model('Maintenance', maintenanceSchema);

export default Maintenance;
