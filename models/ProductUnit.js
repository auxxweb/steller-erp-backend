import mongoose from 'mongoose';
import { PRODUCT_UNIT_STATUS, PRODUCT_CONDITION } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const productUnitSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true,
    },
    serialNumber: {
      type: String,
      required: [true, 'Serial number is required'],
      trim: true,
      maxlength: 100,
    },
    images: [
      {
        url: { type: String, trim: true },
        publicId: { type: String, trim: true },
        thumbnailUrl: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    barcode: { type: String, trim: true },
    qrCode: { type: String, trim: true },
    qrPayload: {
      type: String,
      trim: true,
    },
    assetTag: { type: String, trim: true, uppercase: true },
    location: {
      aisle: { type: String, trim: true, maxlength: 50 },
      shelf: { type: String, trim: true, maxlength: 50 },
      bin: { type: String, trim: true, maxlength: 50 },
      notes: { type: String, trim: true, maxlength: 200 },
    },
    status: {
      type: String,
      enum: { values: Object.values(PRODUCT_UNIT_STATUS), message: 'Invalid unit status' },
      default: PRODUCT_UNIT_STATUS.AVAILABLE,
      index: true,
    },
    condition: {
      type: String,
      enum: { values: Object.values(PRODUCT_CONDITION), message: 'Invalid condition' },
      default: PRODUCT_CONDITION.GOOD,
    },
    purchaseDate: { type: Date },
    purchaseCost: { type: Number, min: 0 },
    warrantyExpiresAt: { type: Date },
    currentRental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental',
      default: null,
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    lastMaintenanceAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

productUnitSchema.index({ branch: 1, serialNumber: 1 }, { unique: true });
productUnitSchema.index({ branch: 1, product: 1, status: 1 });
productUnitSchema.index({ barcode: 1 }, { sparse: true });
productUnitSchema.index({ status: 1, branch: 1 });
productUnitSchema.index({ qrPayload: 1 }, { unique: true, sparse: true });

productUnitSchema.methods.toPublicJSON = function toPublicJSON() {
  const product = this.product;
  const branch = this.branch;

  return {
    id: this._id,
    product:
      product && typeof product === 'object' && product._id
        ? {
            id: product._id,
            name: product.name,
            sku: product.sku,
            brand: product.specs?.brand,
            model: product.specs?.model,
          }
        : product,
    branch:
      branch && typeof branch === 'object' && branch._id
        ? { id: branch._id, name: branch.name, code: branch.code }
        : branch,
    serialNumber: this.serialNumber,
    images: this.images || [],
    barcode: this.barcode,
    qrCode: this.qrCode,
    qrPayload: this.qrPayload,
    assetTag: this.assetTag,
    status: this.status,
    rentalStatus: this.status,
    condition: this.condition,
    location: this.location,
    currentRental: this.currentRental,
    purchaseDate: this.purchaseDate,
    purchaseCost: this.purchaseCost,
    warrantyExpiresAt: this.warrantyExpiresAt,
    notes: this.notes,
    lastMaintenanceAt: this.lastMaintenanceAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const ProductUnit = mongoose.model('ProductUnit', productUnitSchema);

export default ProductUnit;
