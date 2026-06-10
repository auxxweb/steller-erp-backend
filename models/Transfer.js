import mongoose from 'mongoose';
import { TRANSFER_ITEM_STATUS, TRANSFER_STATUS } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const transferItemSchema = new mongoose.Schema(
  {
    productUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductUnit',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    itemStatus: {
      type: String,
      enum: {
        values: Object.values(TRANSFER_ITEM_STATUS),
        message: 'Invalid transfer item status',
      },
      default: TRANSFER_ITEM_STATUS.PENDING,
    },
    notes: { type: String, trim: true },
    dispatchedAt: { type: Date },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveredAt: { type: Date },
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    location: {
      aisle: { type: String, trim: true, maxlength: 50 },
      shelf: { type: String, trim: true, maxlength: 50 },
      bin: { type: String, trim: true, maxlength: 50 },
      notes: { type: String, trim: true, maxlength: 200 },
    },
  },
  { _id: true },
);

const transferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    fromBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    toBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(TRANSFER_STATUS), message: 'Invalid transfer status' },
      default: TRANSFER_STATUS.PENDING,
      index: true,
    },
    items: {
      type: [transferItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Transfer must include at least one unit',
      },
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dispatchedAt: { type: Date },
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deliveredAt: { type: Date },
    trackingNotes: { type: String, trim: true, maxlength: 2000 },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  defaultSchemaOptions,
);

transferSchema.index({ fromBranch: 1, status: 1 });
transferSchema.index({ toBranch: 1, status: 1 });
transferSchema.index({ status: 1, createdAt: -1 });

transferSchema.pre('validate', function validateBranches() {
  if (
    this.fromBranch &&
    this.toBranch &&
    this.fromBranch.toString() === this.toBranch.toString()
  ) {
    this.invalidate('toBranch', 'Source and destination branches must differ');
  }
});

transferSchema.methods.toPublicJSON = function toPublicJSON() {
  const mapUser = (u) =>
    u && typeof u === 'object' && u._id
      ? { id: u._id, name: u.name, email: u.email }
      : u;

  const mapBranch = (b) =>
    b && typeof b === 'object' && b._id
      ? { id: b._id, name: b.name, code: b.code }
      : b;

  const mapUnit = (unit) =>
    unit && typeof unit === 'object' && unit._id
      ? {
          id: unit._id,
          serialNumber: unit.serialNumber,
          status: unit.status,
          qrPayload: unit.qrPayload,
        }
      : unit;

  const mapProduct = (p) =>
    p && typeof p === 'object' && p._id
      ? { id: p._id, name: p.name, sku: p.sku }
      : p;

  return {
    id: this._id,
    transferNumber: this.transferNumber,
    fromBranch: mapBranch(this.fromBranch),
    toBranch: mapBranch(this.toBranch),
    status: this.status,
    items: (this.items || []).map((item) => ({
      id: item._id,
      productUnit: mapUnit(item.productUnit),
      product: mapProduct(item.product),
      itemStatus: item.itemStatus,
      notes: item.notes,
      location: item.location,
      dispatchedAt: item.dispatchedAt,
      deliveredAt: item.deliveredAt,
      dispatchedBy: mapUser(item.dispatchedBy),
      deliveredBy: mapUser(item.deliveredBy),
    })),
    requestedBy: mapUser(this.requestedBy),
    approvedBy: mapUser(this.approvedBy),
    approvedAt: this.approvedAt,
    dispatchedBy: mapUser(this.dispatchedBy),
    dispatchedAt: this.dispatchedAt,
    deliveredBy: mapUser(this.deliveredBy),
    deliveredAt: this.deliveredAt,
    trackingNotes: this.trackingNotes,
    notes: this.notes,
    progress: {
      total: this.items?.length ?? 0,
      dispatched: this.items?.filter((i) => i.itemStatus !== TRANSFER_ITEM_STATUS.PENDING).length ?? 0,
      delivered: this.items?.filter((i) => i.itemStatus === TRANSFER_ITEM_STATUS.DELIVERED).length ?? 0,
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Transfer = mongoose.model('Transfer', transferSchema);

export default Transfer;
