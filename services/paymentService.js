import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Rental from '../models/Rental.js';
import {
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  INVOICE_STATUS,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { generateDocumentNumber } from '../utils/documentNumber.js';
import { recordAudit } from './auditService.js';
import { AUDIT_ACTION } from './auditService.js';
import { runWorkflowTransaction } from './workflow/runTransaction.js';

export const listPayments = async (actor, query = {}) => {
  const filter = {};
  if (actor.role !== ROLES.SUPER_ADMIN) filter.branch = actor.branch;
  else if (query.branch) filter.branch = query.branch;
  if (query.customer) filter.customer = query.customer;
  if (query.invoice) filter.invoice = query.invoice;
  if (query.rental) filter.rental = query.rental;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('customer', 'name phone')
      .populate('invoice', 'invoiceNumber')
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  return {
    payments: payments.map((p) => p.toObject()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

/**
 * Record payment against invoice or rental (supports partial / split via multiple calls).
 */
export const recordPayment = async (payload, actor) => {
  if (!payload.invoice && !payload.rental) {
    throw new AppError('invoice or rental reference is required', 400);
  }

  const amount = Number(payload.amount);
  if (!amount || amount <= 0) throw new AppError('Valid payment amount is required', 400);

  let invoice = null;
  let rental = null;
  let branchId = payload.branch || actor.branch;
  let customerId = payload.customer;

  if (payload.invoice) {
    invoice = await Invoice.findById(payload.invoice);
    if (!invoice) throw new AppError('Invoice not found', 404);
    branchId = invoice.branch;
    customerId = invoice.customer;
    rental = invoice.rental ? await Rental.findById(invoice.rental) : null;
  } else if (payload.rental) {
    rental = await Rental.findById(payload.rental);
    if (!rental) throw new AppError('Rental not found', 404);
    branchId = rental.branch;
    customerId = rental.customer;
    if (rental.invoice) invoice = await Invoice.findById(rental.invoice);
  }

  if (actor.role !== ROLES.SUPER_ADMIN && branchId?.toString() !== actor.branch?.toString()) {
    throw new AppError('Branch access denied', 403);
  }

  return runWorkflowTransaction(async (session) => {
    const opts = session ? { session } : {};
    const paymentNumber = await generateDocumentNumber(Payment, 'paymentNumber', 'PAY');

    const [payment] = await Payment.create(
      [
        {
          paymentNumber,
          branch: branchId,
          customer: customerId,
          invoice: invoice?._id || null,
          rental: rental?._id || null,
          amount,
          method: payload.method || PAYMENT_METHOD.CASH,
          status: PAYMENT_STATUS.COMPLETED,
          transactionRef: payload.transactionRef?.trim(),
          paidAt: payload.paidAt || new Date(),
          receivedBy: actor._id,
          notes: payload.notes?.trim(),
        },
      ],
      opts,
    );

    if (invoice) {
      const paid = (invoice.amounts?.amountPaid || 0) + amount;
      const balance = Math.max(0, (invoice.amounts?.total || 0) - paid);
      invoice.amounts = { ...invoice.amounts, amountPaid: paid, balanceDue: balance };
      invoice.status =
        balance <= 0
          ? INVOICE_STATUS.PAID
          : paid > 0
            ? INVOICE_STATUS.PARTIALLY_PAID
            : invoice.status;
      if (balance <= 0) invoice.paidAt = new Date();
      await invoice.save(opts);
    }

    if (rental) {
      const paid = (rental.amounts?.amountPaid || 0) + amount;
      const total = rental.amounts?.total || 0;
      rental.amounts = {
        ...rental.amounts,
        amountPaid: paid,
        balanceDue: Math.max(0, total - paid - (rental.amounts?.deposit || 0)),
      };
      await rental.save(opts);
    }

    return payment;
  });
};

/**
 * Validate advance/deposit rules before booking confirmation.
 */
export const validateBookingPayment = async ({
  customerId,
  depositRequired,
  advancePaid = 0,
  isNewCustomer = false,
}) => {
  if (isNewCustomer && advancePaid < depositRequired) {
    throw new AppError(
      `New customers require full advance or deposit (₹${depositRequired} required, ₹${advancePaid} received)`,
      400,
    );
  }
  return { valid: true, depositRequired, advancePaid };
};
