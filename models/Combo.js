import mongoose from 'mongoose';
import {
  COMBO_STATUS,
  COMBO_PRICING_RULE,
  COMMON_INVENTORY_BRANCH_CODE,
} from './constants/enums.js';
import { moneyField } from './schemas/money.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const comboItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

const comboSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Combo name is required'],
      trim: true,
      maxlength: 200,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true,
    },
    description: { type: String, trim: true, maxlength: 1000 },
    items: {
      type: [comboItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Combo must contain at least one product',
      },
    },
    pricingRule: {
      type: String,
      enum: {
        values: Object.values(COMBO_PRICING_RULE),
        message: 'Invalid combo pricing rule',
      },
      default: COMBO_PRICING_RULE.SUM_WITH_DISCOUNT,
    },
    pricing: {
      dailyRate: moneyField,
      weeklyRate: moneyField,
      monthlyRate: moneyField,
      depositAmount: moneyField,
      discountPercent: { type: Number, min: 0, max: 100, default: 0 },
      discountAmount: { type: Number, min: 0, default: 0 },
    },
    status: {
      type: String,
      enum: { values: Object.values(COMBO_STATUS), message: 'Invalid status' },
      default: COMBO_STATUS.ACTIVE,
      index: true,
    },
    image: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

comboSchema.index({ branch: 1, code: 1 }, { unique: true });
comboSchema.index({ branch: 1, status: 1 });
comboSchema.index({ name: 'text', code: 'text', description: 'text' });

comboSchema.methods.toPublicJSON = function toPublicJSON() {
  const branch = this.branch;
  const items = (this.items || []).map((entry) => {
    const product = entry.product;
    return {
      product:
        product && typeof product === 'object' && product._id
          ? {
              id: product._id,
              name: product.name,
              sku: product.sku,
              pricing: product.pricing,
              status: product.status,
            }
          : entry.product,
      quantity: entry.quantity,
    };
  });

  const branchData =
    branch && typeof branch === 'object' && branch._id
      ? { id: branch._id, name: branch.name, code: branch.code }
      : branch;

  return {
    id: this._id,
    name: this.name,
    code: this.code,
    branch: branchData,
    isShared:
      branchData &&
      typeof branchData === 'object' &&
      branchData.code === COMMON_INVENTORY_BRANCH_CODE,
    description: this.description,
    items,
    pricingRule: this.pricingRule,
    pricing: this.pricing,
    status: this.status,
    image: this.image,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Combo = mongoose.model('Combo', comboSchema);

export default Combo;
