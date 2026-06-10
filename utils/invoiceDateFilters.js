import { resolveDatePeriodRange } from './datePeriodFilters.js';

/** Invoice lists filter by issue date. */
export const resolveInvoiceDateRange = (query = {}) => resolveDatePeriodRange(query);
