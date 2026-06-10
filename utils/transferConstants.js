import { TRANSFER_STATUS } from '../models/constants/enums.js';
import AppError from './AppError.js';

export const TRANSFER_STATUS_TRANSITIONS = {
  [TRANSFER_STATUS.PENDING]: [TRANSFER_STATUS.APPROVED, TRANSFER_STATUS.CANCELLED],
  [TRANSFER_STATUS.APPROVED]: [TRANSFER_STATUS.IN_TRANSIT, TRANSFER_STATUS.CANCELLED],
  [TRANSFER_STATUS.IN_TRANSIT]: [TRANSFER_STATUS.DELIVERED],
  [TRANSFER_STATUS.DELIVERED]: [],
  [TRANSFER_STATUS.CANCELLED]: [],
};

export const assertTransferTransition = (from, to) => {
  const allowed = TRANSFER_STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new AppError(`Cannot transition transfer from ${from} to ${to}`, 400);
  }
};
