import mongoose from 'mongoose';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const notificationSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: { values: Object.values(NOTIFICATION_TYPE), message: 'Invalid type' },
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: { values: Object.values(NOTIFICATION_CHANNEL), message: 'Invalid channel' },
      default: NOTIFICATION_CHANNEL.IN_APP,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    data: {
      entity: { type: String, trim: true },
      entityId: { type: mongoose.Schema.Types.ObjectId },
      url: { type: String, trim: true },
      payload: { type: mongoose.Schema.Types.Mixed },
    },
    sentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  defaultSchemaOptions,
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
