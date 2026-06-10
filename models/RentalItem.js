import mongoose from 'mongoose';
import { RENTAL_ITEM_STATUS } from './constants/enums.js';
import { moneyField } from './schemas/money.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const rentalItemSchema = new mongoose.Schema(
  {
    rental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    /** Branch where inventory is reserved (product home branch for cross-branch prebook) */
    inventoryBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductUnit',
      default: null,
      index: true,
    },
    combo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Combo',
      default: null,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    rateType: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'flat'],
      default: 'daily',
    },
    unitRate: { ...moneyField, required: true },
    durationDays: { type: Number, min: 1, default: 1 },
    lineSubtotal: moneyField,
    lineDiscount: moneyField,
    lineTax: moneyField,
    lineTotal: moneyField,
    status: {
      type: String,
      enum: { values: Object.values(RENTAL_ITEM_STATUS), message: 'Invalid item status' },
      default: RENTAL_ITEM_STATUS.PENDING,
      index: true,
    },
    issuedAt: { type: Date },
    returnedAt: { type: Date },
    conditionOut: { type: String, trim: true },
    conditionIn: { type: String, trim: true },
    damageNotes: { type: String, trim: true, maxlength: 1000 },
  },
  defaultSchemaOptions,
);

rentalItemSchema.index({ rental: 1, product: 1 });
rentalItemSchema.index({ productUnit: 1, status: 1 });
rentalItemSchema.index({ branch: 1, status: 1 });

rentalItemSchema.methods.toPublicJSON = function toPublicJSON() {
  const product = this.product;
  const productUnit = this.productUnit;

  return {
    id: this._id,
    rental: this.rental,
    branch: this.branch,
    product:
      product && typeof product === 'object' && product._id
        ? {
            id: product._id,
            name: product.name,
            sku: product.sku,
          }
        : product,
    productUnit:
      productUnit && typeof productUnit === 'object' && productUnit._id
        ? {
            id: productUnit._id,
            serialNumber: productUnit.serialNumber,
            status: productUnit.status,
          }
        : productUnit,
    combo: this.combo,
    quantity: this.quantity,
    rateType: this.rateType,
    unitRate: this.unitRate,
    durationDays: this.durationDays,
    lineSubtotal: this.lineSubtotal,
    lineDiscount: this.lineDiscount,
    lineTax: this.lineTax,
    lineTotal: this.lineTotal,
    status: this.status,
    issuedAt: this.issuedAt,
    returnedAt: this.returnedAt,
    conditionOut: this.conditionOut,
    conditionIn: this.conditionIn,
    damageNotes: this.damageNotes,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const RentalItem = mongoose.model('RentalItem', rentalItemSchema);

export default RentalItem;
