import RentalTimeline from '../models/RentalTimeline.js';
import { ROLES } from '../models/constants/enums.js';
import AppError from './AppError.js';

const mergeFilters = (base, extra) => {
  const hasBase = base && Object.keys(base).length > 0;
  const hasExtra = extra && Object.keys(extra).length > 0;
  if (!hasBase) return extra || {};
  if (!hasExtra) return base;
  return { $and: [base, extra] };
};

/**
 * Rentals the employee created or handled (pickup / return / workflow actions).
 */
export const getEmployeeRentalScope = async (actor) => {
  if (actor.role !== ROLES.EMPLOYEE) return {};

  const timelineRentalIds = await RentalTimeline.distinct('rental', {
    branch: actor.branch,
    performedBy: actor._id,
  });

  const or = [{ createdBy: actor._id }];
  if (timelineRentalIds.length) {
    or.push({ _id: { $in: timelineRentalIds } });
  }

  return { $or: or };
};

export const applyEmployeeRentalScope = async (filter, actor) => {
  if (actor.role !== ROLES.EMPLOYEE) return filter;
  const scope = await getEmployeeRentalScope(actor);
  return mergeFilters(filter, scope);
};

export const assertEmployeeRentalAccess = async (rental, actor) => {
  if (actor.role !== ROLES.EMPLOYEE) return;

  const createdBy = rental.createdBy?._id?.toString() || rental.createdBy?.toString();
  if (createdBy === actor._id.toString()) return;

  const handled = await RentalTimeline.exists({
    rental: rental._id,
    performedBy: actor._id,
  });

  if (!handled) {
    throw new AppError('You can only access jobs you created or marked pickup/return on', 403);
  }
};

export const applyEmployeeInvoiceScope = (filter, actor) => {
  if (actor.role === ROLES.EMPLOYEE) {
    filter.createdBy = actor._id;
  }
  return filter;
};

export const assertEmployeeInvoiceAccess = (invoice, actor) => {
  if (actor.role !== ROLES.EMPLOYEE) return;
  const createdBy = invoice.createdBy?._id?.toString() || invoice.createdBy?.toString();
  if (createdBy !== actor._id.toString()) {
    throw new AppError('You can only access invoices you generated', 403);
  }
};
