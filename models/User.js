import mongoose from 'mongoose';
import { hashPassword, comparePassword } from '../utils/password.js';
import { ROLES, USER_STATUS } from './constants/enums.js';
import { addressSchema } from './schemas/address.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';
import { encryptPasswordVault } from '../utils/passwordVault.js';

export { ROLES, USER_STATUS };

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: Object.values(ROLES),
        message: 'Invalid role',
      },
      default: ROLES.EMPLOYEE,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(USER_STATUS),
        message: 'Invalid account status',
      },
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    address: addressSchema,
    avatar: {
      type: String,
      trim: true,
      default: null,
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
    },
    // Branch staff position (for HR-like labeling while keeping role-based access unchanged)
    employeePosition: {
      type: String,
      enum: ['branch_manager', 'sales_staff'],
      default: 'sales_staff',
      index: true,
    },
    shiftIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', index: true },
    ],
    documents: [
      {
        name: { type: String, trim: true, maxlength: 150 },
        url: { type: String, trim: true },
        publicId: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    // Admin-only encrypted store of the most recently set password (for "view password" feature)
    passwordVault: {
      encryptedPassword: { type: String, select: false },
      iv: { type: String, select: false },
      tag: { type: String, select: false },
      updatedAt: { type: Date, select: false },
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    lastLoginAt: { type: Date },
    fcmTokens: [{ type: String, trim: true }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  defaultSchemaOptions,
);

userSchema.index({ role: 1, branch: 1, status: 1 });
userSchema.index({ branch: 1, status: 1 });
userSchema.index({ branch: 1, phone: 1 }, { unique: true, sparse: true });

userSchema.virtual('branchId').get(function branchIdAlias() {
  return this.branch;
});

userSchema.pre('save', async function hashPasswordOnSave() {
  if (!this.isModified('password')) return;
  const plain = String(this.password);
  this.passwordVault = encryptPasswordVault(plain);
  this.password = await hashPassword(plain);
});

userSchema.methods.comparePassword = async function compareUserPassword(candidate) {
  return comparePassword(candidate, this.password);
};

userSchema.methods.isAccountActive = function isAccountActive() {
  return this.status === USER_STATUS.ACTIVE;
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    branch: this.branch,
    branchId: this.branch,
    status: this.status,
    phone: this.phone,
    address: this.address,
    avatar: this.avatar,
    employeeId: this.employeeId,
    employeePosition: this.employeePosition,
    shiftIds: this.shiftIds,
    documents: this.documents,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.model('User', userSchema);

export default User;
