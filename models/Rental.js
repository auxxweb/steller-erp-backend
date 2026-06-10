import mongoose from 'mongoose';
import { RENTAL_STATUS, RENTAL_TYPE } from './constants/enums.js';
import { moneyField } from './schemas/money.schema.js';
import { defaultSchemaOptions } from './plugins/schemaOptions.js';

const rentalSchema = new mongoose.Schema(
  {
    rentalNumber: {
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
    guarantor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Guarantor',
      default: null,
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    deliveryStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    combo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Combo',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(RENTAL_STATUS), message: 'Invalid rental status' },
      default: RENTAL_STATUS.DRAFT,
      index: true,
    },
    rentalType: {
      type: String,
      enum: { values: Object.values(RENTAL_TYPE), message: 'Invalid rental type' },
      default: RENTAL_TYPE.DIRECT,
      index: true,
    },
    scheduledStartAt: { type: Date, required: true },
    scheduledEndAt: { type: Date, required: true },
    actualStartAt: { type: Date },
    actualEndAt: { type: Date },
    pickedUpAt: { type: Date },
    returnedAt: { type: Date },
    reservationExpiresAt: { type: Date, index: true },
    maintenanceStartedAt: { type: Date },
    pickupAddress: { type: String, trim: true },
    returnAddress: { type: String, trim: true },
    amounts: {
      subtotal: moneyField,
      discount: moneyField,
      tax: moneyField,
      total: moneyField,
      deposit: moneyField,
      lateFee: moneyField,
      damageFee: moneyField,
      amountPaid: moneyField,
      balanceDue: moneyField,
    },
    taxRate: { type: Number, min: 0, max: 100, default: 18 },
    notes: { type: String, trim: true, maxlength: 3000 },
    internalNotes: { type: String, trim: true, maxlength: 3000, select: false },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  defaultSchemaOptions,
);

rentalSchema.index({ branch: 1, status: 1, scheduledStartAt: -1 });
rentalSchema.index({ customer: 1, status: 1 });
rentalSchema.index({ branch: 1, scheduledEndAt: 1, status: 1 });
rentalSchema.index({ handledBy: 1, status: 1 });
rentalSchema.index({ branch: 1, scheduledStartAt: 1, scheduledEndAt: 1, status: 1 });

rentalSchema.methods.toPublicJSON = function toPublicJSON() {
  const branch = this.branch;
  const customer = this.customer;
  const combo = this.combo;

  return {
    id: this._id,
    rentalNumber: this.rentalNumber,
    branch:
      branch && typeof branch === 'object' && branch._id
        ? { id: branch._id, name: branch.name, code: branch.code }
        : branch,
    customer:
      customer && typeof customer === 'object' && customer._id
        ? { id: customer._id, name: customer.name, phone: customer.phone }
        : customer,
    guarantor: this.guarantor,
    combo:
      combo && typeof combo === 'object' && combo._id
        ? { id: combo._id, name: combo.name, code: combo.code }
        : combo,
    handledBy: this.handledBy,
    deliveryStaff: this.deliveryStaff,
    status: this.status,
    rentalType: this.rentalType,
    scheduledStartAt: this.scheduledStartAt,
    scheduledEndAt: this.scheduledEndAt,
    actualStartAt: this.actualStartAt,
    actualEndAt: this.actualEndAt,
    pickedUpAt: this.pickedUpAt,
    returnedAt: this.returnedAt,
    reservationExpiresAt: this.reservationExpiresAt,
    maintenanceStartedAt: this.maintenanceStartedAt,
    pickupAddress: this.pickupAddress,
    returnAddress: this.returnAddress,
    amounts: this.amounts,
    taxRate: this.taxRate,
    notes: this.notes,
    invoice: this.invoice,
    cancelledAt: this.cancelledAt,
    cancelReason: this.cancelReason,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

rentalSchema.pre('validate', function validateDates() {
  if (this.scheduledStartAt && this.scheduledEndAt && this.scheduledEndAt <= this.scheduledStartAt) {
    this.invalidate('scheduledEndAt', 'End date must be after start date');
  }
});

const Rental = mongoose.model('Rental', rentalSchema);

export default Rental;
