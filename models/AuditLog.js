import mongoose from 'mongoose';
import { AUDIT_ACTION } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: { values: Object.values(AUDIT_ACTION), message: 'Invalid audit action' },
      required: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    summary: { type: String, trim: true, maxlength: 500 },
    changes: {
      before: { type: mongoose.Schema.Types.Mixed },
      after: { type: mongoose.Schema.Types.Mixed },
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true, maxlength: 500 },
    requestId: { type: String, trim: true },
  },
  defaultSchemaOptions,
);

// Optional: auto-delete logs older than 2 years
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ branch: 1, createdAt: -1 });
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
