import mongoose from 'mongoose';
import { INVOICE_PAYMENT_TYPE, INVOICE_STATUS } from './constants/enums.js';
import { moneyField } from './schemas/money.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const invoiceLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 300 },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    rentalItem: { type: mongoose.Schema.Types.ObjectId, ref: 'RentalItem' },
    quantity: { type: Number, min: 1, default: 1 },
    unitPrice: moneyField,
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    lineTotal: moneyField,
  },
  { _id: true },
);

const snapshotSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 500 },
    gstin: { type: String, trim: true, uppercase: true },
  },
  { _id: false },
);

const businessSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 500 },
    gstin: { type: String, trim: true, uppercase: true },
    website: { type: String, trim: true },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    rental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(INVOICE_STATUS), message: 'Invalid invoice status' },
      default: INVOICE_STATUS.DRAFT,
      index: true,
    },
    isLocked: { type: Boolean, default: false, index: true },
    lockedAt: { type: Date },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isCredit: { type: Boolean, default: false },
    issueDate: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date },
    customerSnapshot: snapshotSchema,
    businessSnapshot: businessSnapshotSchema,
    lineItems: [invoiceLineSchema],
    amounts: {
      subtotal: moneyField,
      discount: moneyField,
      lateFee: moneyField,
      damageFee: moneyField,
      tax: moneyField,
      total: moneyField,
      advanceAmount: moneyField,
      amountPaid: moneyField,
      balanceDue: moneyField,
      gstEnabled: { type: Boolean, default: true },
      gstRate: { type: Number, min: 0, max: 100, default: 18 },
    },
    payment: {
      type: {
        type: String,
        enum: Object.values(INVOICE_PAYMENT_TYPE),
        default: INVOICE_PAYMENT_TYPE.CASH,
      },
      cashAmount: moneyField,
      onlineAmount: moneyField,
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    terms: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true },
  },
  defaultSchemaOptions,
);

invoiceSchema.index({ branch: 1, status: 1, issueDate: -1 });
invoiceSchema.index({ customer: 1, status: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ 'customerSnapshot.name': 'text', invoiceNumber: 'text' });

invoiceSchema.methods.toPublicJSON = function toPublicJSON() {
  const customer = this.customer;
  const branch = this.branch;
  const rental = this.rental;

  return {
    id: this._id,
    invoiceNumber: this.invoiceNumber,
    branch:
      branch && typeof branch === 'object' && branch._id
        ? { id: branch._id, name: branch.name, code: branch.code }
        : branch,
    customer:
      customer && typeof customer === 'object' && customer._id
        ? {
            id: customer._id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
          }
        : customer,
    rental:
      rental && typeof rental === 'object' && rental._id
        ? { id: rental._id, rentalNumber: rental.rentalNumber, status: rental.status }
        : rental,
    status: this.status,
    isLocked: this.isLocked,
    lockedAt: this.lockedAt,
    isCredit: this.isCredit,
    issueDate: this.issueDate,
    dueDate: this.dueDate,
    paidAt: this.paidAt,
    customerSnapshot: this.customerSnapshot,
    businessSnapshot: this.businessSnapshot,
    lineItems: this.lineItems,
    amounts: this.amounts,
    payment: this.payment,
    notes: this.notes,
    terms: this.terms,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
