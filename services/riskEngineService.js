import Customer from '../models/Customer.js';
import Rental from '../models/Rental.js';
import Invoice from '../models/Invoice.js';
import Guarantor from '../models/Guarantor.js';
import {
  CUSTOMER_STATUS,
  RENTAL_STATUS,
  INVOICE_STATUS,
  RISK_LEVEL,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { computeRiskScore } from '../utils/riskScore.js';
import { recalculateCustomerRisk } from './customerService.js';

/**
 * Full risk analysis for booking decisions.
 */
export const analyzeCustomerRisk = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new AppError('Customer not found', 404);

  const [rentals, guarantorCount, unpaidInvoices] = await Promise.all([
    Rental.find({ customer: customerId }).select('status').lean(),
    Guarantor.countDocuments({ customer: customerId }),
    Invoice.countDocuments({
      customer: customerId,
      status: { $in: [INVOICE_STATUS.ISSUED, INVOICE_STATUS.PARTIALLY_PAID, INVOICE_STATUS.OVERDUE] },
    }),
  ]);

  const overdueCount = rentals.filter((r) => r.status === RENTAL_STATUS.OVERDUE).length;
  const cancelledCount = rentals.filter((r) => r.status === RENTAL_STATUS.CANCELLED).length;

  const result = computeRiskScore({
    customer,
    rentals,
    guarantorCount,
  });

  let score = result.score;
  const factors = [...result.factors];

  if (unpaidInvoices > 0) {
    score += Math.min(25, unpaidInvoices * 8);
    factors.push({ code: 'unpaid_invoices', weight: unpaidInvoices * 8, detail: `${unpaidInvoices} open invoice(s)` });
  }
  if (overdueCount > 0) {
    score += Math.min(30, overdueCount * 10);
    factors.push({ code: 'overdue_rentals', weight: overdueCount * 10, detail: `${overdueCount} overdue rental(s)` });
  }
  if (cancelledCount >= 3) {
    score += 10;
    factors.push({ code: 'frequent_cancellations', weight: 10, detail: `${cancelledCount} cancellations` });
  }

  score = Math.min(100, Math.max(0, score));
  let level = result.level;
  if (score >= 70) level = RISK_LEVEL.HIGH;
  else if (score >= 40) level = RISK_LEVEL.MEDIUM;
  else level = RISK_LEVEL.LOW;

  return {
    score,
    level,
    factors,
    blocked: customer.status === CUSTOMER_STATUS.BLOCKED,
    requiresOverride: customer.status === CUSTOMER_STATUS.BLOCKED || level === RISK_LEVEL.HIGH,
    warnings:
      level === RISK_LEVEL.HIGH
        ? ['High risk customer — verify deposit and ID before confirming.']
        : level === RISK_LEVEL.MEDIUM
          ? ['Medium risk — additional deposit may be required.']
          : [],
  };
};

export const assertCustomerCanBook = async (customerId, { allowOverride = false } = {}) => {
  const analysis = await analyzeCustomerRisk(customerId);

  if (analysis.blocked && !allowOverride) {
    throw new AppError('Customer is blocked. Admin override required to create a booking.', 403);
  }

  return analysis;
};

export const refreshCustomerRisk = recalculateCustomerRisk;
