import User from '../models/User.js';
import Shift from '../models/Shift.js';
import Rental from '../models/Rental.js';
import Customer from '../models/Customer.js';
import Transfer from '../models/Transfer.js';
import Invoice from '../models/Invoice.js';
import RentalTimeline from '../models/RentalTimeline.js';
import AuditLog from '../models/AuditLog.js';
import { ROLES, USER_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';

const TEAM_ROLES = [ROLES.EMPLOYEE, ROLES.DELIVERY_STAFF, ROLES.BRANCH_ADMIN];

const POSITION_LABELS = {
  branch_manager: 'Branch manager',
  sales_staff: 'Sales staff',
};

const mapCountRows = (rows) =>
  rows.reduce((acc, { _id, count }) => {
    if (_id) acc[_id.toString()] = count;
    return acc;
  }, {});

const assertBranchAdmin = (actor) => {
  if (actor.role !== ROLES.BRANCH_ADMIN) {
    throw new AppError('Only branch admins can view branch team', 403);
  }
  if (!actor.branch) {
    throw new AppError('No branch assigned to your account', 403);
  }
  return actor.branch.toString();
};

const buildTeamFilter = (branchId, query = {}) => {
  const filter = {
    branch: branchId,
    role: { $in: TEAM_ROLES },
  };

  const accountStatus = query.accountStatus || 'active';
  if (accountStatus === 'deactivated') {
    filter.status = USER_STATUS.INACTIVE;
  } else if (accountStatus === 'all') {
    // no status filter
  } else {
    filter.status = { $ne: USER_STATUS.INACTIVE };
  }

  if (query.role && TEAM_ROLES.includes(query.role)) {
    filter.role = query.role;
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { employeeId: regex }];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

const formatShift = (shift) =>
  shift
    ? {
        id: shift._id.toString(),
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        daysOfWeek: shift.daysOfWeek,
      }
    : null;

const formatMemberBase = (user, shiftsById = {}) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone || null,
  role: user.role,
  employeePosition: user.employeePosition,
  employeePositionLabel: POSITION_LABELS[user.employeePosition] || user.employeePosition,
  employeeId: user.employeeId || null,
  status: user.status,
  avatar: user.avatar,
  documentCount: user.documents?.length || 0,
  shiftIds: (user.shiftIds || []).map((id) => id.toString()),
  shifts: (user.shiftIds || []).map((id) => shiftsById[id.toString()]).filter(Boolean),
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  address: user.address,
});

const mergeActivity = (items, limit = 8) =>
  items
    .filter(Boolean)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);

const toActivityFromAudit = (log) => ({
  id: `audit-${log._id}`,
  type: 'audit',
  action: log.action,
  title: log.summary || `${log.action} ${log.entity}`,
  subtitle: log.entity,
  entityId: log.entityId?.toString(),
  at: log.createdAt,
});

const toActivityFromRental = (rental) => ({
  id: `rental-${rental._id}`,
  type: 'rental',
  title: rental.rentalNumber,
  subtitle: rental.customer?.name
    ? `${rental.customer.name} · ${rental.status}`
    : rental.status,
  entityId: rental._id.toString(),
  at: rental.createdAt,
});

const toActivityFromTimeline = (row) => ({
  id: `timeline-${row._id}`,
  type: 'timeline',
  title: row.rental?.rentalNumber || 'Rental',
  subtitle: row.summary || row.event,
  entityId: row.rental?._id?.toString() || row.rental?.toString(),
  at: row.createdAt,
});

const toActivityFromCustomer = (customer) => ({
  id: `customer-${customer._id}`,
  type: 'customer',
  title: customer.name,
  subtitle: customer.phone ? `Onboarded · ${customer.phone}` : 'Customer onboarded',
  entityId: customer._id.toString(),
  at: customer.createdAt,
});

const toActivityFromTransfer = (transfer) => ({
  id: `transfer-${transfer._id}`,
  type: 'transfer',
  title: transfer.transferNumber,
  subtitle: transfer.status,
  entityId: transfer._id.toString(),
  at: transfer.createdAt,
});

const toActivityFromInvoice = (invoice) => ({
  id: `invoice-${invoice._id}`,
  type: 'invoice',
  title: invoice.invoiceNumber,
  subtitle: invoice.status,
  entityId: invoice._id.toString(),
  at: invoice.createdAt,
});

async function loadShiftMap(userDocs) {
  const shiftIds = [
    ...new Set(
      userDocs.flatMap((u) => (u.shiftIds || []).map((id) => id.toString())),
    ),
  ];
  if (!shiftIds.length) return {};
  const shifts = await Shift.find({ _id: { $in: shiftIds } }).lean();
  return shifts.reduce((acc, s) => {
    acc[s._id.toString()] = formatShift(s);
    return acc;
  }, {});
}

async function loadStatsForUsers(userIds, branchId) {
  const oidBranch = branchId;
  const [
    rentals,
    customers,
    transfers,
    timelines,
    invoices,
    audits,
  ] = await Promise.all([
    Rental.aggregate([
      { $match: { branch: oidBranch, createdBy: { $in: userIds } } },
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    ]),
    Customer.aggregate([
      { $match: { branch: oidBranch, createdBy: { $in: userIds } } },
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    ]),
    Transfer.aggregate([
      {
        $match: {
          requestedBy: { $in: userIds },
          $or: [{ fromBranch: oidBranch }, { toBranch: oidBranch }],
        },
      },
      { $group: { _id: '$requestedBy', count: { $sum: 1 } } },
    ]),
    RentalTimeline.aggregate([
      { $match: { branch: oidBranch, performedBy: { $in: userIds } } },
      { $group: { _id: '$performedBy', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { branch: oidBranch, createdBy: { $in: userIds } } },
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    ]),
    AuditLog.aggregate([
      { $match: { branch: oidBranch, user: { $in: userIds } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    rentals: mapCountRows(rentals),
    customers: mapCountRows(customers),
    transfers: mapCountRows(transfers),
    timelines: mapCountRows(timelines),
    invoices: mapCountRows(invoices),
    audits: mapCountRows(audits),
  };
}

async function loadRecentActivityForUsers(userIds, branchId, perUser = 4) {
  const limit = Math.min(80, userIds.length * perUser * 2);
  const [audits, rentals, timelines, customers] = await Promise.all([
    AuditLog.find({ branch: branchId, user: { $in: userIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Rental.find({ branch: branchId, createdBy: { $in: userIds } })
      .select('rentalNumber status createdAt customer createdBy')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    RentalTimeline.find({ branch: branchId, performedBy: { $in: userIds } })
      .populate('rental', 'rentalNumber')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Customer.find({ branch: branchId, createdBy: { $in: userIds } })
      .select('name phone createdAt createdBy')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const byUser = Object.fromEntries(userIds.map((id) => [id.toString(), []]));

  audits.forEach((log) => {
    const uid = log.user?.toString();
    if (uid && byUser[uid]) byUser[uid].push(toActivityFromAudit(log));
  });
  rentals.forEach((r) => {
    const uid = r.createdBy?.toString();
    if (uid && byUser[uid]) byUser[uid].push(toActivityFromRental(r));
  });
  timelines.forEach((t) => {
    const uid = t.performedBy?.toString();
    if (uid && byUser[uid]) byUser[uid].push(toActivityFromTimeline(t));
  });
  customers.forEach((c) => {
    const uid = c.createdBy?.toString();
    if (uid && byUser[uid]) byUser[uid].push(toActivityFromCustomer(c));
  });

  Object.keys(byUser).forEach((uid) => {
    byUser[uid] = mergeActivity(byUser[uid], perUser);
  });

  return byUser;
}

export const listBranchTeam = async (actor, query = {}) => {
  const branchId = assertBranchAdmin(actor);
  const filter = buildTeamFilter(branchId, query);

  const users = await User.find(filter).sort({ name: 1 }).lean();
  if (!users.length) {
    return {
      summary: { total: 0, active: 0, byRole: {} },
      members: [],
    };
  }

  const userIds = users.map((u) => u._id);
  const [shiftsById, stats, activityByUser] = await Promise.all([
    loadShiftMap(users),
    loadStatsForUsers(userIds, branchId),
    loadRecentActivityForUsers(userIds, branchId),
  ]);

  const byRole = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  const members = users.map((user) => {
    const id = user._id.toString();
    return {
      ...formatMemberBase(user, shiftsById),
      stats: {
        rentalsCreated: stats.rentals[id] || 0,
        customersOnboarded: stats.customers[id] || 0,
        transfersRequested: stats.transfers[id] || 0,
        rentalActions: stats.timelines[id] || 0,
        invoicesCreated: stats.invoices[id] || 0,
        auditEvents: stats.audits[id] || 0,
      },
      recentActivity: activityByUser[id] || [],
    };
  });

  return {
    summary: {
      total: members.length,
      active: members.filter((m) => m.status !== USER_STATUS.INACTIVE).length,
      byRole,
    },
    members,
  };
};

export const getBranchTeamMember = async (actor, userId) => {
  const branchId = assertBranchAdmin(actor);

  const user = await User.findOne({
    _id: userId,
    branch: branchId,
    role: { $in: TEAM_ROLES },
  }).lean();

  if (!user) {
    throw new AppError('Team member not found in your branch', 404);
  }

  const shiftsById = await loadShiftMap([user]);
  const stats = await loadStatsForUsers([user._id], branchId);
  const id = user._id.toString();

  const [works, activity] = await Promise.all([
    loadMemberWorks(user._id, branchId),
    loadMemberActivity(user._id, branchId, 25),
  ]);

  return {
    member: {
      ...formatMemberBase(user, shiftsById),
      documents: (user.documents || []).map((d) => ({
        name: d.name,
        url: d.url,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
      })),
      stats: {
        rentalsCreated: stats.rentals[id] || 0,
        customersOnboarded: stats.customers[id] || 0,
        transfersRequested: stats.transfers[id] || 0,
        rentalActions: stats.timelines[id] || 0,
        invoicesCreated: stats.invoices[id] || 0,
        auditEvents: stats.audits[id] || 0,
      },
    },
    works,
    activity,
  };
};

async function loadMemberWorks(userId, branchId) {
  const [rentals, customers, transfers, timelines, invoices] = await Promise.all([
    Rental.find({ branch: branchId, createdBy: userId })
      .select('rentalNumber status createdAt updatedAt totalAmount')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    Customer.find({ branch: branchId, createdBy: userId })
      .select('name phone status createdAt')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    Transfer.find({
      requestedBy: userId,
      $or: [{ fromBranch: branchId }, { toBranch: branchId }],
    })
      .select('transferNumber status createdAt fromBranch toBranch')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    RentalTimeline.find({ branch: branchId, performedBy: userId })
      .populate('rental', 'rentalNumber status')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    Invoice.find({ branch: branchId, createdBy: userId })
      .select('invoiceNumber status amounts createdAt')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
  ]);

  return {
    rentals: rentals.map((r) => ({
      id: r._id.toString(),
      rentalNumber: r.rentalNumber,
      status: r.status,
      customerName: r.customer?.name,
      totalAmount: r.totalAmount,
      createdAt: r.createdAt,
    })),
    customers: customers.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      phone: c.phone,
      status: c.status,
      createdAt: c.createdAt,
    })),
    transfers: transfers.map((t) => ({
      id: t._id.toString(),
      transferNumber: t.transferNumber,
      status: t.status,
      createdAt: t.createdAt,
    })),
    rentalActions: timelines.map((t) => ({
      id: t._id.toString(),
      rentalNumber: t.rental?.rentalNumber,
      rentalId: t.rental?._id?.toString(),
      event: t.event,
      summary: t.summary,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      createdAt: t.createdAt,
    })),
    invoices: invoices.map((inv) => ({
      id: inv._id.toString(),
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      total: inv.amounts?.total,
      createdAt: inv.createdAt,
    })),
  };
}

async function loadMemberActivity(userId, branchId, limit = 25) {
  const fetchLimit = limit;
  const [audits, rentals, timelines, customers, transfers, invoices] = await Promise.all([
    AuditLog.find({ user: userId, branch: branchId })
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    Rental.find({ createdBy: userId, branch: branchId })
      .select('rentalNumber status createdAt customer')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    RentalTimeline.find({ performedBy: userId, branch: branchId })
      .populate('rental', 'rentalNumber')
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    Customer.find({ createdBy: userId, branch: branchId })
      .select('name phone createdAt')
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    Transfer.find({
      requestedBy: userId,
      $or: [{ fromBranch: branchId }, { toBranch: branchId }],
    })
      .select('transferNumber status createdAt')
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    Invoice.find({ createdBy: userId, branch: branchId })
      .select('invoiceNumber status createdAt')
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
  ]);

  return mergeActivity(
    [
      ...audits.map(toActivityFromAudit),
      ...rentals.map(toActivityFromRental),
      ...timelines.map(toActivityFromTimeline),
      ...customers.map(toActivityFromCustomer),
      ...transfers.map(toActivityFromTransfer),
      ...invoices.map(toActivityFromInvoice),
    ],
    limit,
  );
}
