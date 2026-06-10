import { CUSTOMER_STATUS, RISK_LEVEL, RENTAL_STATUS } from '../models/constants/enums.js';

/**
 * Map numeric score to risk band.
 */
export const scoreToRiskLevel = (score) => {
  if (score >= 70) return RISK_LEVEL.HIGH;
  if (score >= 40) return RISK_LEVEL.MEDIUM;
  return RISK_LEVEL.LOW;
};

/**
 * Calculate customer risk from rental history, balances, ID verification, guarantors.
 */
export const computeRiskScore = ({
  customer,
  rentals = [],
  guarantorCount = 0,
}) => {
  const factors = [];
  let score = 50;

  if (customer.status === CUSTOMER_STATUS.BLOCKED) {
    return {
      score: 100,
      level: RISK_LEVEL.HIGH,
      factors: [{ factor: 'blocked', impact: 50, detail: 'Customer is blocked' }],
    };
  }

  const activeStatuses = [
    RENTAL_STATUS.RESERVED,
    RENTAL_STATUS.PICKED_UP,
    RENTAL_STATUS.ACTIVE,
    RENTAL_STATUS.OVERDUE,
    RENTAL_STATUS.MAINTENANCE,
  ];
  const overdueCount = rentals.filter((r) => r.status === RENTAL_STATUS.OVERDUE).length;
  const activeCount = rentals.filter((r) => activeStatuses.includes(r.status)).length;
  const cancelledCount = rentals.filter((r) => r.status === RENTAL_STATUS.CANCELLED).length;
  const completedCount = rentals.filter((r) =>
    [RENTAL_STATUS.RETURNED, RENTAL_STATUS.CLOSED].includes(r.status),
  ).length;

  if (overdueCount > 0) {
    const impact = Math.min(30, overdueCount * 15);
    score += impact;
    factors.push({ factor: 'overdue_rentals', impact, detail: `${overdueCount} overdue rental(s)` });
  }

  if (activeCount > 2) {
    const impact = 10;
    score += impact;
    factors.push({ factor: 'multiple_active_rentals', impact, detail: `${activeCount} active rentals` });
  }

  const outstanding = customer.outstandingBalance || 0;
  const creditLimit = customer.creditLimit || 0;
  if (creditLimit > 0 && outstanding > creditLimit * 0.8) {
    const impact = 20;
    score += impact;
    factors.push({
      factor: 'high_utilization',
      impact,
      detail: 'Outstanding balance near credit limit',
    });
  } else if (outstanding > 0 && creditLimit === 0) {
    const impact = 10;
    score += impact;
    factors.push({ factor: 'outstanding_balance', impact, detail: 'Has outstanding balance' });
  }

  const idProofs = customer.idProofs?.length
    ? customer.idProofs
  : customer.idProof?.type
      ? [customer.idProof]
      : [];
  const verifiedProofs = idProofs.filter((p) => p.verifiedAt).length;
  if (verifiedProofs === 0 && idProofs.length === 0) {
    const impact = 15;
    score += impact;
    factors.push({ factor: 'no_id_proof', impact, detail: 'No ID proof on file' });
  } else if (verifiedProofs > 0) {
    const impact = -15;
    score += impact;
    factors.push({ factor: 'verified_id', impact, detail: 'Verified ID proof' });
  } else if (idProofs.length > 0) {
    const impact = -5;
    score += impact;
    factors.push({ factor: 'id_uploaded', impact, detail: 'ID document uploaded' });
  }

  if (guarantorCount === 0 && customer.customerType === 'individual') {
    const impact = 10;
    score += impact;
    factors.push({ factor: 'no_guarantor', impact, detail: 'No guarantor on file' });
  } else if (guarantorCount > 0) {
    const impact = -10;
    score += impact;
    factors.push({ factor: 'has_guarantor', impact, detail: `${guarantorCount} guarantor(s)` });
  }

  if (completedCount >= 3 && overdueCount === 0) {
    const impact = -10;
    score += impact;
    factors.push({
      factor: 'good_history',
      impact,
      detail: `${completedCount} completed rentals`,
    });
  }

  if (cancelledCount >= 2) {
    const impact = Math.min(15, cancelledCount * 5);
    score += impact;
    factors.push({ factor: 'cancellations', impact, detail: `${cancelledCount} cancelled rentals` });
  }

  if (customer.customerType === 'business' && customer.gstin) {
    const impact = -5;
    score += impact;
    factors.push({ factor: 'business_gstin', impact, detail: 'Registered business with GSTIN' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    level: scoreToRiskLevel(score),
    factors,
  };
};

export default computeRiskScore;
