import mongoose from 'mongoose';
import { CATEGORY_STATUS } from './constants/enums.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 140,
    },
    description: { type: String, trim: true, maxlength: 500 },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    sortOrder: { type: Number, default: 0 },
    status: {
      type: String,
      enum: { values: Object.values(CATEGORY_STATUS), message: 'Invalid status' },
      default: CATEGORY_STATUS.ACTIVE,
      index: true,
    },
    image: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

/** Slugs are unique company-wide; branch is an optional location tag only. */
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ parent: 1, status: 1 });
categorySchema.index({ branch: 1, status: 1, sortOrder: 1 });

categorySchema.methods.toPublicJSON = function toPublicJSON() {
  const branch = this.branch;
  const branchData =
    branch && typeof branch === 'object' && branch._id
      ? { id: branch._id, name: branch.name, code: branch.code }
      : branch || null;

  return {
    id: this._id,
    name: this.name,
    slug: this.slug,
    description: this.description,
    image: this.image,
    status: this.status,
    branch: branchData,
    sortOrder: this.sortOrder,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Category = mongoose.model('Category', categorySchema);

export default Category;
