import Rental from '../models/Rental.js';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import { ROLES, RENTAL_TYPE } from '../models/constants/enums.js';
import { applyDatePeriodFilter, resolveDatePeriodRange } from '../utils/datePeriodFilters.js';

const RENTAL_POPULATE = [
  { path: 'branch', select: 'name code' },
  { path: 'customer', select: 'name phone company' },
  { path: 'handledBy', select: 'name' },
];

const INVOICE_POPULATE = [
  { path: 'branch', select: 'name code' },
  { path: 'customer', select: 'name phone' },
  { path: 'rental', select: 'rentalNumber status' },
];

const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const applyBranchScope = (filter, actor, query) => {
  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE) {
    filter.branch = actor.branch;
  } else if (query.branch) {
    filter.branch = query.branch;
  }
};

const buildRentalReportFilter = async (actor, query = {}) => {
  const filter = {};
  applyBranchScope(filter, actor, query);

  if (query.status) filter.status = query.status;
  if (query.rentalType && Object.values(RENTAL_TYPE).includes(query.rentalType)) {
    filter.rentalType = query.rentalType;
  }

  applyDatePeriodFilter(filter, query, 'createdAt');

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(escapeRegex(term), 'i');
    const customerQuery = {
      $or: [{ name: regex }, { phone: regex }, { company: regex }],
    };
    if (filter.branch) customerQuery.branch = filter.branch;
    const customerIds = await Customer.find(customerQuery).distinct('_id');
    filter.$or = [
      { rentalNumber: regex },
      { notes: regex },
      ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
    ];
  }

  return filter;
};

const buildSalesReportFilter = (actor, query = {}) => {
  const filter = {};
  applyBranchScope(filter, actor, query);

  if (query.status) filter.status = query.status;
  if (query.isLocked === 'true') filter.isLocked = true;
  if (query.isLocked === 'false') filter.isLocked = false;

  const dateRange = resolveDatePeriodRange(query);
  if (dateRange) filter.issueDate = dateRange;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ invoiceNumber: regex }, { 'customerSnapshot.name': regex }];
  }

  return filter;
};

const rentalSummary = async (filter) => {
  const [totals, statusCounts] = await Promise.all([
    Rental.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$amounts.total', 0] } },
          totalPaid: { $sum: { $ifNull: ['$amounts.amountPaid', 0] } },
          totalBalance: { $sum: { $ifNull: ['$amounts.balanceDue', 0] } },
          totalDeposit: { $sum: { $ifNull: ['$amounts.deposit', 0] } },
        },
      },
    ]),
    Rental.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const row = totals[0] || {};
  const byStatus = {};
  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return {
    totalJobs: row.count || 0,
    totalAmount: row.totalAmount || 0,
    totalPaid: row.totalPaid || 0,
    totalBalance: row.totalBalance || 0,
    totalDeposit: row.totalDeposit || 0,
    byStatus,
  };
};

const salesSummary = async (filter) => {
  const [totals, statusCounts] = await Promise.all([
    Invoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          subtotal: { $sum: { $ifNull: ['$amounts.subtotal', 0] } },
          tax: { $sum: { $ifNull: ['$amounts.tax', 0] } },
          total: { $sum: { $ifNull: ['$amounts.total', 0] } },
          amountPaid: { $sum: { $ifNull: ['$amounts.amountPaid', 0] } },
          advanceAmount: { $sum: { $ifNull: ['$amounts.advanceAmount', 0] } },
          balanceDue: { $sum: { $ifNull: ['$amounts.balanceDue', 0] } },
        },
      },
    ]),
    Invoice.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const row = totals[0] || {};
  const byStatus = {};
  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return {
    totalInvoices: row.count || 0,
    subtotal: row.subtotal || 0,
    tax: row.tax || 0,
    totalSales: row.total || 0,
    amountPaid: row.amountPaid || 0,
    advanceAmount: row.advanceAmount || 0,
    balanceDue: row.balanceDue || 0,
    byStatus,
  };
};

export const getRentalJobReport = async (actor, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const skip = (page - 1) * limit;
  const filter = await buildRentalReportFilter(actor, query);
  const sortField = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [rentals, total, summary] = await Promise.all([
    Rental.find(filter)
      .populate(RENTAL_POPULATE)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    Rental.countDocuments(filter),
    rentalSummary(filter),
  ]);

  return {
    summary,
    rentals: rentals.map((r) => r.toPublicJSON()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getSalesReport = async (actor, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const skip = (page - 1) * limit;
  const filter = buildSalesReportFilter(actor, query);

  const [invoices, total, summary] = await Promise.all([
    Invoice.find(filter)
      .populate(INVOICE_POPULATE)
      .sort({ issueDate: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
    salesSummary(filter),
  ]);

  return {
    summary,
    invoices: invoices.map((i) => i.toPublicJSON()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

/** Export-friendly row data (no pagination cap for CSV). */
export const exportRentalJobReport = async (actor, query = {}) => {
  const filter = await buildRentalReportFilter(actor, query);
  const rentals = await Rental.find(filter)
    .populate(RENTAL_POPULATE)
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const summary = await rentalSummary(filter);
  return {
    summary,
    rows: rentals.map((r) => ({
      rentalNumber: r.rentalNumber,
      customer: r.customer?.name || '',
      phone: r.customer?.phone || '',
      branch: r.branch?.name || '',
      status: r.status,
      rentalType: r.rentalType,
      scheduledStart: r.scheduledStartAt,
      scheduledEnd: r.scheduledEndAt,
      returnedAt: r.returnedAt,
      total: r.amounts?.total ?? 0,
      deposit: r.amounts?.deposit ?? 0,
      paid: r.amounts?.amountPaid ?? 0,
      balance: r.amounts?.balanceDue ?? 0,
      createdAt: r.createdAt,
    })),
  };
};

export const exportSalesReport = async (actor, query = {}) => {
  const filter = buildSalesReportFilter(actor, query);
  const invoices = await Invoice.find(filter)
    .populate(INVOICE_POPULATE)
    .sort({ issueDate: -1 })
    .limit(5000)
    .lean();

  const summary = await salesSummary(filter);
  return {
    summary,
    rows: invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customerSnapshot?.name || inv.customer?.name || '',
      branch: inv.branch?.name || '',
      issueDate: inv.issueDate,
      status: inv.status,
      rentalNumber: inv.rental?.rentalNumber || '',
      subtotal: inv.amounts?.subtotal ?? 0,
      tax: inv.amounts?.tax ?? 0,
      total: inv.amounts?.total ?? 0,
      advance: inv.amounts?.advanceAmount ?? 0,
      paid: inv.amounts?.amountPaid ?? 0,
      balance: inv.amounts?.balanceDue ?? 0,
      isLocked: inv.isLocked,
    })),
  };
};
