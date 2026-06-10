import { QR_SCAN_ACTION } from '../models/constants/enums.js';

export const validateQrVerify = (body) => {
  const errors = [];
  if (!body.scannedValue?.trim() && !body.qrPayload?.trim() && !body.unitId) {
    errors.push('scannedValue, qrPayload, or unitId is required');
  }
  return errors;
};

export const validateQrScan = (body) => {
  const errors = validateQrVerify(body);

  if (!body.action || !Object.values(QR_SCAN_ACTION).includes(body.action)) {
    errors.push('Valid action is required (pickup, return, transfer, maintenance)');
  }

  if (body.toBranchId && !/^[a-f\d]{24}$/i.test(body.toBranchId)) {
    errors.push('Invalid toBranchId');
  }

  return errors;
};
