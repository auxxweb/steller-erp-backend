import mongoose from 'mongoose';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const shiftSchema = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Shift name is required'],
      trim: true,
      maxlength: 120,
      index: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10, // e.g. 09:00
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10, // e.g. 18:00
    },
    daysOfWeek: {
      // 0=Sun ... 6=Sat
      type: [Number],
      default: [1, 2, 3, 4, 5],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: 'daysOfWeek must be an array of integers between 0 and 6',
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  defaultSchemaOptions,
);

shiftSchema.index({ branch: 1, status: 1, name: 1 });

shiftSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    branch: this.branch,
    name: this.name,
    startTime: this.startTime,
    endTime: this.endTime,
    daysOfWeek: this.daysOfWeek,
    status: this.status,
    createdBy: this.createdBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Shift = mongoose.model('Shift', shiftSchema);

export default Shift;

