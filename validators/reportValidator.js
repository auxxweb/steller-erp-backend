import { validateListQueryPeriod } from './listQueryValidator.js';

export const validateReportQuery = (query) => {
  const errors = [...validateListQueryPeriod(query)];
  return errors;
};
