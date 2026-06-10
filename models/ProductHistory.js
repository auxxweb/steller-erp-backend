import mongoose from 'mongoose';
import { PRODUCT_HISTORY_ACTION } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const productHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductUnit',
      default: null,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    action: {
      type: String,
      enum: { values: Object.values(PRODUCT_HISTORY_ACTION), message: 'Invalid history action' },
      required: true,
      index: true,
    },
    summary: { type: String, trim: true, maxlength: 500 },
    changes: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  defaultSchemaOptions,
);

productHistorySchema.index({ product: 1, createdAt: -1 });
productHistorySchema.index({ productUnit: 1, createdAt: -1 });

productHistorySchema.methods.toPublicJSON = function toPublicJSON() {
  const user = this.performedBy;
  return {
    id: this._id,
    product: this.product,
    productUnit: this.productUnit,
    branch: this.branch,
    action: this.action,
    summary: this.summary,
    changes: this.changes,
    metadata: this.metadata,
    performedBy:
      user && typeof user === 'object' && user._id
        ? { id: user._id, name: user.name, email: user.email }
        : user,
    createdAt: this.createdAt,
  };
};

const ProductHistory = mongoose.model('ProductHistory', productHistorySchema);

export default ProductHistory;
