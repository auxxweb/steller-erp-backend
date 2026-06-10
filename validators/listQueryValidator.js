import { DATE_PERIOD_VALUES } from '../utils/datePeriodFilters.js';

export const validateListQueryPeriod = (query) => {
  const errors = [];
  if (query.period && !DATE_PERIOD_VALUES.includes(query.period)) {
    errors.push('Invalid period filter');
  }
  return errors;
};
