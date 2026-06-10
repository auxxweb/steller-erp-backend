import mongoose from 'mongoose';
import { PAYMENT_STATUS, PAYMENT_METHOD } from './constants/enums.js';
import { requiredMoneyField } from './schemas/money.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
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
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true,
    },
    rental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental',
      default: null,
      index: true,
    },
    amount: requiredMoneyField,
    method: {
      type: String,
      enum: { values: Object.values(PAYMENT_METHOD), message: 'Invalid payment method' },
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(PAYMENT_STATUS), message: 'Invalid payment status' },
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    transactionRef: { type: String, trim: true, maxlength: 120 },
    paidAt: { type: Date, default: Date.now },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    metadata: { type: Map, of: String },
  },
  defaultSchemaOptions,
);

paymentSchema.index({ branch: 1, paidAt: -1 });
paymentSchema.index({ invoice: 1, status: 1 });
paymentSchema.index({ customer: 1, paidAt: -1 });

paymentSchema.pre('validate', function requireInvoiceOrRental() {
  if (!this.invoice && !this.rental) {
    this.invalidate('invoice', 'Payment must reference an invoice or rental');
  }
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
