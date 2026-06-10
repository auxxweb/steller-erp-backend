import Invoice from '../models/Invoice.js';
import Rental from '../models/Rental.js';
import RentalItem from '../models/RentalItem.js';
import Customer from '../models/Customer.js';
import Branch from '../models/Branch.js';
import {
  INVOICE_PAYMENT_TYPE,
  INVOICE_STATUS,
  RENTAL_STATUS,
  ROLES,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import {
  applyEmployeeInvoiceScope,
  assertEmployeeInvoiceAccess,
} from '../utils/employeeScope.js';
import { generateDocumentNumber } from '../utils/documentNumber.js';
import { recalculateInvoiceAmounts } from '../utils/invoiceCalculations.js';
import { resolveInvoiceDateRange } from '../utils/invoiceDateFilters.js';
import { notifyPaymentEvent } from './workflow/workflowNotificationService.js';
import { runWorkflowTransaction } from './workflow/runTransaction.js';
import {
  buildWhatsAppShareText,
  renderInvoiceHtml,
} from './invoiceTemplateService.js';

const POPULATE = [
  { path: 'customer', select: 'name phone email address gstin' },
  { path: 'branch', select: 'name code phone email address settings' },
  { path: 'rental', select: 'rentalNumber status' },
];

const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  return [addr.line1, addr.line2, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .join(', ');
};

const buildBusinessSnapshot = (branch) => {
  const inv = branch?.settings?.invoice || {};
  return {
    name: inv.businessName || branch?.name || 'Stellar Rentals',
    logoUrl: inv.logoUrl || '',
    phone: branch?.phone || '',
    email: branch?.email || '',
    address: formatAddress(branch?.address),
    gstin: inv.gstin || '',
    website: inv.website || '',
  };
};

const buildCustomerSnapshot = (customer) => ({
  name: customer?.name || '',
  phone: customer?.phone || '',
  email: customer?.email || '',
  address: formatAddress(customer?.address),
  gstin: customer?.gstin || '',
});

const buildLineItemsFromRental = (items, taxRate) =>
  items.map((item) => {
    const productName = item.product?.name || 'Rental item';
    const serialLabel =
      item.productUnit && typeof item.productUnit === 'object'
        ? item.productUnit.serialNumber
        : null;
    return {
      description: serialLabel ? `${productName} (${serialLabel})` : productName,
      product: item.product?._id || item.product,
      rentalItem: item._id,
      quantity: item.quantity,
      unitPrice: item.unitRate,
      taxRate,
      lineTotal: item.lineTotal,
    };
  });

const applyAmountsToInvoice = (invoice, overrides = {}) => {
  const amounts = recalculateInvoiceAmounts({
    lineItems: invoice.lineItems,
    discount: overrides.discount ?? invoice.amounts?.discount ?? 0,
    lateFee: overrides.lateFee ?? invoice.amounts?.lateFee ?? 0,
    damageFee: overrides.damageFee ?? invoice.amounts?.damageFee ?? 0,
    gstEnabled: overrides.gstEnabled ?? invoice.amounts?.gstEnabled ?? true,
    gstRate: overrides.gstRate ?? invoice.amounts?.gstRate ?? 18,
    advanceAmount: overrides.advanceAmount ?? invoice.amounts?.advanceAmount ?? 0,
    amountPaid: overrides.amountPaid ?? invoice.amounts?.amountPaid ?? 0,
  });

  invoice.amounts = {
    ...invoice.amounts,
    subtotal: amounts.subtotal,
    discount: amounts.discount,
    lateFee: amounts.lateFee,
    damageFee: amounts.damageFee,
    tax: amounts.tax,
    total: amounts.total,
    advanceAmount: amounts.advanceAmount,
    amountPaid: amounts.amountPaid,
    balanceDue: amounts.balanceDue,
    gstEnabled: amounts.gstEnabled,
    gstRate: amounts.gstRate,
  };

  return invoice;
};

const assertInvoiceEditable = (invoice) => {
  if (invoice.isLocked) {
    throw new AppError('Invoice is closed — no further edits allowed', 400);
  }
  if (invoice.status === INVOICE_STATUS.VOID) {
    throw new AppError('Cannot edit a void invoice', 400);
  }
};

export const listInvoices = async (actor, query = {}) => {
  const filter = {};
  if (actor.role !== ROLES.SUPER_ADMIN) filter.branch = actor.branch;
  else if (query.branch) filter.branch = query.branch;

  if (query.status) filter.status = query.status;
  if (query.customer) filter.customer = query.customer;
  if (query.rental) filter.rental = query.rental;
  if (query.isLocked === 'true') filter.isLocked = true;
  if (query.isLocked === 'false') filter.isLocked = false;

  const dateRange = resolveInvoiceDateRange(query);
  if (dateRange) filter.issueDate = dateRange;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ invoiceNumber: regex }, { 'customerSnapshot.name': regex }];
  }

  applyEmployeeInvoiceScope(filter, actor);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).populate(POPULATE).sort({ issueDate: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);

  return {
    invoices: invoices.map((i) => i.toPublicJSON()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getInvoiceById = async (id, actor) => {
  const invoice = await Invoice.findById(id).populate(POPULATE);
  if (!invoice) throw new AppError('Invoice not found', 404);
  const branchId = invoice.branch?._id?.toString() || invoice.branch?.toString();
  if (actor.role !== ROLES.SUPER_ADMIN && branchId !== actor.branch?.toString()) {
    throw new AppError('Access denied', 403);
  }
  assertEmployeeInvoiceAccess(invoice, actor);
  return invoice;
};

/**
 * Create or return existing draft invoice for a returned rental (one per rental).
 */
export const createOrGetDraftInvoiceFromRental = async (rentalId, actor) => {
  const rental = await Rental.findById(rentalId).populate('branch', 'code name phone email address settings');
  if (!rental) throw new AppError('Rental not found', 404);

  if (
    ![RENTAL_STATUS.RETURNED, RENTAL_STATUS.PARTIALLY_RETURNED, RENTAL_STATUS.CLOSED].includes(
      rental.status,
    )
  ) {
    throw new AppError('Invoice is created after equipment return', 400);
  }

  if (rental.invoice) {
    const existing = await Invoice.findById(rental.invoice).populate(POPULATE);
    if (existing) return existing;
  }

  return buildDraftInvoiceForRental(rental, actor);
};

export const buildDraftInvoiceForRental = async (rental, actor) => {
  const customer = await Customer.findById(rental.customer);
  if (!customer) throw new AppError('Customer not found', 404);

  const items = await RentalItem.find({ rental: rental._id })
    .populate('product', 'name sku')
    .populate('productUnit', 'serialNumber');
  const branch = rental.branch?._id ? rental.branch : await Branch.findById(rental.branch);
  const branchCode = branch?.code || 'BR';
  const gstRate = rental.taxRate ?? branch?.settings?.taxRate ?? 18;
  const lineItems = buildLineItemsFromRental(items, gstRate);

  const advanceAmount = rental.amounts?.deposit ?? 0;
  const amountPaid = rental.amounts?.amountPaid ?? 0;

  return runWorkflowTransaction(async (session) => {
    const opts = session ? { session } : {};
    const invoiceNumber = await generateDocumentNumber(
      Invoice,
      'invoiceNumber',
      branch?.settings?.invoicePrefix || 'INV',
      branchCode,
    );

    const draft = {
      invoiceNumber,
      branch: branch._id || branch,
      customer: customer._id,
      rental: rental._id,
      status: INVOICE_STATUS.DRAFT,
      isLocked: false,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      customerSnapshot: buildCustomerSnapshot(customer),
      businessSnapshot: buildBusinessSnapshot(branch),
      lineItems,
      amounts: {
        discount: rental.amounts?.discount ?? 0,
        lateFee: rental.amounts?.lateFee ?? 0,
        damageFee: rental.amounts?.damageFee ?? 0,
        advanceAmount,
        amountPaid,
        gstEnabled: true,
        gstRate,
      },
      payment: { type: INVOICE_PAYMENT_TYPE.CASH, cashAmount: 0, onlineAmount: 0 },
      terms: branch?.settings?.invoice?.terms || '',
      createdBy: actor._id,
    };

    const [invoice] = await Invoice.create([draft], opts);
    applyAmountsToInvoice(invoice);
    await invoice.save(opts);

    rental.invoice = invoice._id;
    await rental.save(opts);

    await invoice.populate(POPULATE);
    return invoice;
  });
};

/**
 * @deprecated Use createOrGetDraftInvoiceFromRental — kept for manual generate endpoint.
 */
export const generateInvoiceFromRental = async (rentalId, actor, options = {}) => {
  const invoice = await createOrGetDraftInvoiceFromRental(rentalId, actor);
  if (options.finalize) {
    return finalizeInvoice(invoice._id, actor);
  }
  return invoice;
};

export const updateInvoice = async (id, actor, payload) => {
  const invoice = await getInvoiceById(id, actor);
  assertInvoiceEditable(invoice);

  if (payload.customerSnapshot) {
    invoice.customerSnapshot = {
      ...invoice.customerSnapshot?.toObject?.() || invoice.customerSnapshot,
      ...payload.customerSnapshot,
    };
  }

  if (payload.businessSnapshot) {
    invoice.businessSnapshot = {
      ...invoice.businessSnapshot?.toObject?.() || invoice.businessSnapshot,
      ...payload.businessSnapshot,
    };
  }

  if (payload.lineItems) {
    invoice.lineItems = payload.lineItems.map((line) => ({
      description: line.description,
      product: line.product,
      rentalItem: line.rentalItem,
      quantity: line.quantity ?? 1,
      unitPrice: line.unitPrice ?? 0,
      taxRate: line.taxRate ?? 0,
      lineTotal:
        line.lineTotal ??
        (line.quantity ?? 1) * (line.unitPrice ?? 0),
    }));
  }

  if (payload.isCredit !== undefined) invoice.isCredit = payload.isCredit;
  if (payload.notes !== undefined) invoice.notes = payload.notes;
  if (payload.terms !== undefined) invoice.terms = payload.terms;
  if (payload.dueDate) invoice.dueDate = new Date(payload.dueDate);

  if (payload.payment) {
    invoice.payment = {
      ...invoice.payment?.toObject?.() || invoice.payment,
      ...payload.payment,
    };
    const { type, cashAmount = 0, onlineAmount = 0 } = invoice.payment;
    if (type === INVOICE_PAYMENT_TYPE.CASH) {
      invoice.payment.cashAmount = invoice.amounts?.balanceDue ?? cashAmount;
      invoice.payment.onlineAmount = 0;
    } else if (type === INVOICE_PAYMENT_TYPE.ONLINE) {
      invoice.payment.onlineAmount = invoice.amounts?.balanceDue ?? onlineAmount;
      invoice.payment.cashAmount = 0;
    }
  }

  const amountOverrides = payload.amounts ? { ...payload.amounts } : {};
  if (amountOverrides.gstEnabled !== undefined) {
    amountOverrides.gstEnabled = Boolean(amountOverrides.gstEnabled);
  }
  applyAmountsToInvoice(invoice, amountOverrides);

  if (invoice.payment?.type === INVOICE_PAYMENT_TYPE.SPLIT) {
    const cash = Number(invoice.payment.cashAmount) || 0;
    const online = Number(invoice.payment.onlineAmount) || 0;
    if (Math.abs(cash + online - invoice.amounts.balanceDue) > 1) {
      throw new AppError('Cash + online must equal balance due for split payment', 400);
    }
  }

  await invoice.save();
  await invoice.populate(POPULATE);
  return invoice;
};

/**
 * Close job — lock invoice (no further edits).
 */
export const finalizeInvoice = async (id, actor) => {
  const invoice = await getInvoiceById(id, actor);
  if (invoice.isLocked) return invoice;

  applyAmountsToInvoice(invoice);

  const balance = invoice.amounts?.balanceDue ?? 0;
  invoice.isLocked = true;
  invoice.lockedAt = new Date();
  invoice.lockedBy = actor._id;

  if (invoice.isCredit && balance > 0) {
    invoice.status = INVOICE_STATUS.ISSUED;
  } else if (balance <= 0) {
    invoice.status = INVOICE_STATUS.PAID;
    invoice.paidAt = new Date();
  } else {
    invoice.status = INVOICE_STATUS.ISSUED;
  }

  await invoice.save();
  await invoice.populate(POPULATE);

  await notifyPaymentEvent({
    branchId: invoice.branch._id || invoice.branch,
    customerId: invoice.customer._id?.toString() || invoice.customer.toString(),
    title: 'Invoice finalized',
    body: `Invoice ${invoice.invoiceNumber} — balance ₹${balance}`,
    data: { invoiceId: invoice._id.toString() },
  });

  if (invoice.rental) {
    const rental = await Rental.findById(invoice.rental);
    if (rental && rental.status === RENTAL_STATUS.RETURNED) {
      rental.status = RENTAL_STATUS.CLOSED;
      rental.updatedBy = actor._id;
      await rental.save();
    }
  }

  return invoice;
};

export const getInvoiceHtml = async (id, actor) => {
  const invoice = await getInvoiceById(id, actor);
  const json = invoice.toPublicJSON();
  return renderInvoiceHtml(json);
};

export const getWhatsAppShareUrl = async (id, actor) => {
  const invoice = await getInvoiceById(id, actor);
  const text = buildWhatsAppShareText(invoice.toPublicJSON());
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
};

export const voidInvoice = async (id, actor, reason) => {
  const invoice = await getInvoiceById(id, actor);
  if (invoice.status === INVOICE_STATUS.VOID) throw new AppError('Invoice already void', 400);

  invoice.status = INVOICE_STATUS.VOID;
  invoice.voidedAt = new Date();
  invoice.voidReason = reason?.trim();
  invoice.isLocked = true;
  await invoice.save();
  return invoice;
};
