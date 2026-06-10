import { INVOICE_PAYMENT_TYPE } from '../models/constants/enums.js';
import { validateListQueryPeriod } from './listQueryValidator.js';

const isValidObjectId = (value) =>
  typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);

export const validateUpdateInvoice = (body) => {
  const errors = [];

  if (body.customerSnapshot !== undefined && typeof body.customerSnapshot !== 'object') {
    errors.push('customerSnapshot must be an object');
  }

  if (body.lineItems !== undefined) {
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      errors.push('At least one line item is required');
    }
  }

  if (body.amounts !== undefined && typeof body.amounts !== 'object') {
    errors.push('amounts must be an object');
  }

  if (body.payment?.type && !Object.values(INVOICE_PAYMENT_TYPE).includes(body.payment.type)) {
    errors.push('Invalid payment type');
  }

  if (body.isCredit !== undefined && typeof body.isCredit !== 'boolean') {
    errors.push('isCredit must be a boolean');
  }

  return errors;
};

export const validateInvoiceListQuery = (query) => {
  const errors = [...validateListQueryPeriod(query)];
  if (query.customer && !isValidObjectId(query.customer)) {
    errors.push('Invalid customer ID');
  }
  return errors;
};
