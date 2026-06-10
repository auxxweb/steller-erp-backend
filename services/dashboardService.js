import Rental from '../models/Rental.js';
import RentalTimeline from '../models/RentalTimeline.js';
import Invoice from '../models/Invoice.js';
import Transfer from '../models/Transfer.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { RENTAL_STATUS, ROLES, TRANSFER_STATUS, USER_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { getMyBranch } from './branchService.js';
import { applyEmployeeRentalScope } from '../utils/employeeScope.js';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const branchFilter = (actor) => {
  if (actor.role === ROLES.BRANCH_ADMIN || actor.role === ROLES.EMPLOYEE || actor.role === ROLES.DELIVERY_STAFF) {
    return actor.branch ? { branch: actor.branch } : null;
  }
  return {};
};

const transferBranchFilter = (actor) => {
  if (actor.role === ROLES.SUPER_ADMIN) return {};
  if (!actor.branch) return null;
  return { $or: [{ fromBranch: actor.branch }, { toBranch: actor.branch }] };
};

const assertBranch = (actor) => {
  const f = branchFilter(actor);
  if (f === null) throw new AppError('No branch assigned to your account', 403);
  return f;
};

const assertTransferBranch = (actor) => {
  const f = transferBranchFilter(actor);
  if (f === null) throw new AppError('No branch assigned to your account', 403);
  return f;
};

const statusPie = (byStatus, labels = {}) =>
  Object.entries(byStatus)
    .filter(([, count]) => count > 0)
    .map(([key, value]) => ({
      id: key,
      label: labels[key] || key.replace(/_/g, ' '),
      value,
    }));

const fillTrend = (aggRows, days = 7) => {
  const map = new Map(aggRows.map((r) => [r._id, r.count]));
  const result = [];
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = addDays(today, -i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    result.push({ date: key, label, value: map.get(key) || 0 });
  }
  return result;
};

const countTrend = async (Model, match, dateField, days = 7) => {
  const start = addDays(startOfDay(new Date()), -(days - 1));
  const rows = await Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } },
        count: { $sum: 1 },
      },
    },
  ]);
  return fillTrend(rows, days);
};

const sumTrend = async (Model, match, dateField, sumField, days = 7) => {
  const start = addDays(startOfDay(new Date()), -(days - 1));
  const rows = await Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } },
        count: { $sum: { $ifNull: [`$${sumField}`, 0] } },
      },
    },
  ]);
  return fillTrend(rows, days);
};

const groupByStatus = async (Model, match) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  return rows.reduce((acc, { _id, count }) => {
    if (_id) acc[_id] = count;
    return acc;
  }, {});
};

const recentActivity = async ({
  rentalMatch,
  invoiceMatch,
  transferMatch,
  includeSales,
  includeTransfers = true,
  limit = 12,
}) => {
  const queries = [
    Rental.find(rentalMatch)
      .select('rentalNumber status createdAt customer')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ];

  if (includeTransfers && transferMatch) {
    queries.push(
      Transfer.find(transferMatch)
        .select('transferNumber status createdAt fromBranch toBranch')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    );
  }

  if (includeSales && invoiceMatch) {
    queries.push(
      Invoice.find(invoiceMatch)
        .select('invoiceNumber status issueDate amounts.total customerSnapshot')
        .sort({ issueDate: -1 })
        .limit(limit)
        .lean(),
    );
  }

  const results = await Promise.all(queries);
  let rentals = results[0];
  let transfers = [];
  let invoices = [];
  let idx = 1;
  if (includeTransfers && transferMatch) {
    transfers = results[idx++];
  }
  if (includeSales && invoiceMatch) {
    invoices = results[idx] || [];
  }

  const items = [
    ...rentals.map((r) => ({
      id: `rental-${r._id}`,
      type: 'rental',
      title: r.rentalNumber,
      subtitle: `${r.customer?.name || 'Customer'} · ${r.status.replace(/_/g, ' ')}`,
      at: r.createdAt,
      entityId: r._id.toString(),
    })),
    ...transfers.map((t) => ({
      id: `transfer-${t._id}`,
      type: 'transfer',
      title: t.transferNumber,
      subtitle: t.status.replace(/_/g, ' '),
      at: t.createdAt,
      entityId: t._id.toString(),
    })),
    ...invoices.map((inv) => ({
      id: `invoice-${inv._id}`,
      type: 'invoice',
      title: inv.invoiceNumber,
      subtitle: `${inv.customerSnapshot?.name || 'Customer'} · ₹${Number(inv.amounts?.total || 0).toLocaleString('en-IN')}`,
      at: inv.issueDate,
      entityId: inv._id.toString(),
    })),
  ];

  return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
};

const rentalStatusLabels = Object.fromEntries(
  Object.values(RENTAL_STATUS).map((s) => [s, s.replace(/_/g, ' ')]),
);

const invoiceStatusLabels = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  cancelled: 'Cancelled',
};

const transferStatusLabels = Object.fromEntries(
  Object.values(TRANSFER_STATUS).map((s) => [s, s.replace(/_/g, ' ')]),
);

const monthStart = startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const buildRentalCharts = async (match) => {
  const byStatus = await groupByStatus(Rental, match);
  const trend = await countTrend(Rental, match, 'createdAt');
  return {
    rentalStatus: statusPie(byStatus, rentalStatusLabels),
    rentalsTrend: trend,
  };
};

const buildSalesCharts = async (match) => {
  const byStatus = await groupByStatus(Invoice, match);
  const trend = await sumTrend(Invoice, match, 'issueDate', 'amounts.total');
  return {
    invoiceStatus: statusPie(byStatus, invoiceStatusLabels),
    salesTrend: trend,
  };
};

const buildTransferCharts = async (match) => {
  const byStatus = await groupByStatus(Transfer, match);
  return { transferStatus: statusPie(byStatus, transferStatusLabels) };
};

export const getDashboard = async (actor) => {
  switch (actor.role) {
    case ROLES.SUPER_ADMIN:
      return getSuperAdminDashboard(actor);
    case ROLES.BRANCH_ADMIN:
      return getBranchAdminDashboard(actor);
    case ROLES.EMPLOYEE:
      return getEmployeeDashboard(actor);
    case ROLES.DELIVERY_STAFF:
      return getDeliveryDashboard(actor);
    default:
      throw new AppError('Dashboard not available for this role', 403);
  }
};

async function getSuperAdminDashboard(actor) {
  const rentalMatch = {};
  const invoiceMatch = {};
  const transferMatch = transferBranchFilter(actor);

  const [
    branchCount,
    userCount,
    customerCount,
    productCount,
    rentalsThisMonth,
    salesThisMonth,
    transferPending,
    chartsRental,
    chartsSales,
    chartsTransfer,
    activity,
  ] = await Promise.all([
    Branch.countDocuments({ status: 'active' }),
    User.countDocuments({ status: { $ne: USER_STATUS.INACTIVE } }),
    Customer.countDocuments(),
    Product.countDocuments(),
    Rental.countDocuments(rentalMatch),
    Rental.countDocuments({ ...rentalMatch, createdAt: { $gte: monthStart } }),
    Invoice.aggregate([
      { $match: { issueDate: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$amounts.total', 0] } } } },
    ]),
    Transfer.countDocuments({ status: TRANSFER_STATUS.PENDING }),
    buildRentalCharts(rentalMatch),
    buildSalesCharts(invoiceMatch),
    buildTransferCharts(transferMatch),
    recentActivity({ rentalMatch, invoiceMatch, transferMatch, includeSales: true }),
  ]);

  const activeRentals = await Rental.countDocuments({
    status: { $in: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.PICKED_UP, RENTAL_STATUS.OVERDUE, RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED] },
  });

  return {
    role: actor.role,
    features: { sales: true, reports: true, branches: true },
    kpis: [
      { id: 'branches', label: 'Active branches', value: branchCount, format: 'number' },
      { id: 'users', label: 'Users', value: userCount, format: 'number' },
      { id: 'activeRentals', label: 'Active rentals', value: activeRentals, format: 'number' },
      { id: 'rentalsMonth', label: 'Bookings this month', value: rentalsThisMonth, format: 'number' },
      { id: 'salesMonth', label: 'Sales this month', value: salesThisMonth[0]?.total || 0, format: 'currency' },
      { id: 'customers', label: 'Customers', value: customerCount, format: 'number' },
    ],
    charts: { ...chartsRental, ...chartsSales, ...chartsTransfer },
    activity,
  };
}

async function getBranchAdminDashboard(actor) {
  const match = assertBranch(actor);
  const transferMatch = assertTransferBranch(actor);
  const branch = await getMyBranch(actor);

  const [
    staffCount,
    productCount,
    customerCount,
    activeRentals,
    rentalsThisMonth,
    salesThisMonth,
    transferPending,
    chartsRental,
    chartsSales,
    chartsTransfer,
    activity,
  ] = await Promise.all([
    User.countDocuments({ branch: match.branch, status: { $ne: USER_STATUS.INACTIVE } }),
    Product.countDocuments({ branch: match.branch }),
    Customer.countDocuments({ branch: match.branch }),
    Rental.countDocuments({
      ...match,
      status: { $in: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.PICKED_UP, RENTAL_STATUS.OVERDUE, RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED] },
    }),
    Rental.countDocuments({ ...match, createdAt: { $gte: monthStart } }),
    Invoice.aggregate([
      { $match: { ...match, issueDate: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$amounts.total', 0] } } } },
    ]),
    Transfer.countDocuments({ ...transferMatch, status: TRANSFER_STATUS.PENDING }),
    buildRentalCharts(match),
    buildSalesCharts(match),
    buildTransferCharts(transferMatch),
    recentActivity({ rentalMatch: match, invoiceMatch: match, transferMatch, includeSales: true }),
  ]);

  return {
    role: actor.role,
    features: { sales: true, reports: true, branches: false },
    branch: { id: branch._id.toString(), name: branch.name, code: branch.code },
    kpis: [
      { id: 'activeRentals', label: 'Active rentals', value: activeRentals, format: 'number' },
      { id: 'rentalsMonth', label: 'Bookings this month', value: rentalsThisMonth, format: 'number' },
      { id: 'salesMonth', label: 'Sales this month', value: salesThisMonth[0]?.total || 0, format: 'currency' },
      { id: 'customers', label: 'Customers', value: customerCount, format: 'number' },
      { id: 'products', label: 'Products', value: productCount, format: 'number' },
      { id: 'transfers', label: 'Pending transfers', value: transferPending, format: 'number' },
    ],
    charts: { ...chartsRental, ...chartsSales, ...chartsTransfer },
    activity,
  };
}

async function getEmployeeDashboard(actor) {
  const match = assertBranch(actor);
  const rentalMatch = await applyEmployeeRentalScope({ ...match }, actor);
  const invoiceMatch = { ...match, createdBy: actor._id };

  const activeStatuses = {
    status: {
      $in: [
        RENTAL_STATUS.ACTIVE,
        RENTAL_STATUS.PICKED_UP,
        RENTAL_STATUS.OVERDUE,
        RENTAL_STATUS.RESERVED,
        RENTAL_STATUS.CONFIRMED,
      ],
    },
  };

  const [
    activeRentals,
    jobsThisMonth,
    invoicesGenerated,
    returnsMarked,
    chartsRental,
    activity,
  ] = await Promise.all([
    Rental.countDocuments({ ...rentalMatch, ...activeStatuses }),
    Rental.countDocuments({ ...rentalMatch, createdAt: { $gte: monthStart } }),
    Invoice.countDocuments({ ...invoiceMatch }),
    RentalTimeline.countDocuments({
      branch: match.branch,
      performedBy: actor._id,
      event: { $in: ['pickup_completed', 'return_processed'] },
    }),
    buildRentalCharts(rentalMatch),
    recentActivity({
      rentalMatch,
      invoiceMatch,
      includeSales: true,
      includeTransfers: false,
      limit: 12,
    }),
  ]);

  return {
    role: actor.role,
    features: { sales: false, invoices: true, reports: false, branches: false },
    kpis: [
      { id: 'activeRentals', label: 'My active jobs', value: activeRentals, format: 'number' },
      { id: 'jobsMonth', label: 'Jobs this month', value: jobsThisMonth, format: 'number' },
      { id: 'invoices', label: 'Invoices generated', value: invoicesGenerated, format: 'number' },
      { id: 'returns', label: 'Returns / pickups handled', value: returnsMarked, format: 'number' },
    ],
    charts: chartsRental,
    activity,
  };
}

async function getDeliveryDashboard(actor) {
  const match = assertBranch(actor);
  const transferMatch = assertTransferBranch(actor);

  const [pickupQueue, returnQueue, inTransit, chartsRental, chartsTransfer, activity] = await Promise.all([
    Rental.countDocuments({
      ...match,
      status: { $in: [RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED] },
    }),
    Rental.countDocuments({
      ...match,
      status: { $in: [RENTAL_STATUS.PICKED_UP, RENTAL_STATUS.ACTIVE, RENTAL_STATUS.OVERDUE, RENTAL_STATUS.PARTIALLY_RETURNED] },
    }),
    Transfer.countDocuments({
      ...transferMatch,
      status: { $in: [TRANSFER_STATUS.APPROVED, TRANSFER_STATUS.IN_TRANSIT] },
    }),
    buildRentalCharts(match),
    buildTransferCharts(transferMatch),
    recentActivity({
      rentalMatch: match,
      transferMatch,
      includeSales: false,
    }),
  ]);

  return {
    role: actor.role,
    features: { sales: false, reports: false, branches: false },
    kpis: [
      { id: 'pickups', label: 'Ready for pickup', value: pickupQueue, format: 'number' },
      { id: 'returns', label: 'Out / due return', value: returnQueue, format: 'number' },
      { id: 'inTransit', label: 'Transfers in transit', value: inTransit, format: 'number' },
    ],
    charts: { ...chartsRental, ...chartsTransfer },
    activity,
  };
}
