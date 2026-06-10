import mongoose from 'mongoose';
import { ATTENDANCE_STATUS } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const attendanceSchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(ATTENDANCE_STATUS), message: 'Invalid attendance status' },
      default: ATTENDANCE_STATUS.PRESENT,
      index: true,
    },
    checkInAt: { type: Date },
    checkOutAt: { type: Date },
    workMinutes: { type: Number, min: 0, default: 0 },
    checkInLocation: {
      lat: { type: Number },
      lng: { type: Number },
      label: { type: String, trim: true },
    },
    notes: { type: String, trim: true, maxlength: 500 },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  defaultSchemaOptions,
);

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ branch: 1, date: -1, status: 1 });
attendanceSchema.index({ branch: 1, user: 1, date: -1 });

attendanceSchema.pre('save', function computeWorkMinutes() {
  if (this.checkInAt && this.checkOutAt) {
    const diff = this.checkOutAt - this.checkInAt;
    this.workMinutes = Math.max(0, Math.round(diff / 60000));
  }
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
