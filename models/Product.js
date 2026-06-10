import mongoose from 'mongoose';
import { INVENTORY_SCOPE, PRODUCT_STATUS, PRODUCT_TYPE } from './constants/enums.js';
import { moneyField } from './schemas/money.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 200,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
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
    inventoryScope: {
      type: String,
      enum: {
        values: Object.values(INVENTORY_SCOPE),
        message: 'Invalid inventory scope',
      },
      default: INVENTORY_SCOPE.COMMON,
      index: true,
    },
    /** Per-branch placement / allocation (assign after create for common-inventory products) */
    branchLocations: [
      {
        branch: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Branch',
          required: true,
        },
        locationLabel: { type: String, trim: true, maxlength: 100 },
        quantity: { type: Number, min: 0, default: 0 },
        notes: { type: String, trim: true, maxlength: 200 },
      },
    ],
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    description: { type: String, trim: true, maxlength: 2000 },
    type: {
      type: String,
      enum: { values: Object.values(PRODUCT_TYPE), message: 'Invalid product type' },
      default: PRODUCT_TYPE.RENTAL,
    },
    status: {
      type: String,
      enum: { values: Object.values(PRODUCT_STATUS), message: 'Invalid status' },
      default: PRODUCT_STATUS.ACTIVE,
      index: true,
    },
    trackUnits: {
      type: Boolean,
      default: true,
    },
    pricing: {
      individual: {
        dailyRate: moneyField,
        weeklyRate: moneyField,
        monthlyRate: moneyField,
      },
      combo: {
        dailyRate: moneyField,
        weeklyRate: moneyField,
        monthlyRate: moneyField,
      },
      depositAmount: moneyField,
      salePrice: moneyField,
    },
    advancePayment: {
      required: { type: Boolean, default: false },
      percentage: { type: Number, min: 0, max: 100, default: 0 },
    },
    specs: {
      brand: { type: String, trim: true },
      model: { type: String, trim: true },
      serializable: { type: Boolean, default: true },
      attributes: { type: Map, of: String },
    },
    images: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true, lowercase: true }],
    totalUnits: { type: Number, min: 0, default: 0 },
    availableUnits: { type: Number, min: 0, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

productSchema.index({ branch: 1, sku: 1 }, { unique: true });
productSchema.index({ branch: 1, category: 1, status: 1 });
productSchema.index({ name: 'text', sku: 'text', tags: 'text' });
productSchema.index({ 'specs.brand': 1, 'specs.model': 1 });

productSchema.methods.toPublicJSON = function toPublicJSON() {
  const category = this.category;
  const branch = this.branch;

  return {
    id: this._id,
    name: this.name,
    sku: this.sku,
    brand: this.specs?.brand,
    model: this.specs?.model,
    specs: this.specs,
    inventoryScope: this.inventoryScope,
    branch:
      branch && typeof branch === 'object' && branch._id
        ? { id: branch._id, name: branch.name, code: branch.code }
        : branch,
    branchLocations: (this.branchLocations || []).map((loc) => {
      const locBranch = loc.branch;
      return {
        branch:
          locBranch && typeof locBranch === 'object' && locBranch._id
            ? { id: locBranch._id, name: locBranch.name, code: locBranch.code }
            : locBranch,
        locationLabel: loc.locationLabel,
        quantity: loc.quantity,
        notes: loc.notes,
      };
    }),
    category:
      category && typeof category === 'object' && category._id
        ? { id: category._id, name: category.name, slug: category.slug }
        : category,
    description: this.description,
    type: this.type,
    status: this.status,
    trackUnits: this.trackUnits,
    pricing: this.pricing,
    advancePayment: this.advancePayment,
    images: this.images,
    tags: this.tags,
    totalUnits: this.totalUnits,
    availableUnits: this.availableUnits,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Product = mongoose.model('Product', productSchema);

export default Product;
