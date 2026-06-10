import mongoose from 'mongoose';
import { LEAVE_STATUS, LEAVE_TYPE } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const leaveSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: { values: Object.values(LEAVE_TYPE), message: 'Invalid leave type' },
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(LEAVE_STATUS), message: 'Invalid leave status' },
      default: LEAVE_STATUS.PENDING,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, min: 0.5, default: 1 },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    attachmentUrl: { type: String, trim: true },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  defaultSchemaOptions,
);

leaveSchema.index({ branch: 1, status: 1, startDate: 1 });
leaveSchema.index({ user: 1, status: 1, startDate: -1 });
leaveSchema.index({ branch: 1, startDate: 1, endDate: 1 });

leaveSchema.pre('validate', function validateLeaveDates() {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date must be on or after start date');
  }
});

const Leave = mongoose.model('Leave', leaveSchema);

export default Leave;
