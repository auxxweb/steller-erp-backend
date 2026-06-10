import AppError from '../utils/AppError.js';

/**
 * Run a validator function against req.body.
 * @param {(body: object) => string[]} validator
 */
export const validateBody = (validator) => (req, _res, next) => {
  const errors = validator(req.body);

  if (errors.length > 0) {
    return next(new AppError('Validation failed', 400, errors));
  }

  next();
};

/**
 * Run a validator function against req.query.
 * @param {(query: object) => string[]} validator
 */
export const validateQuery = (validator) => (req, _res, next) => {
  const errors = validator(req.query);

  if (errors.length > 0) {
    return next(new AppError('Validation failed', 400, errors));
  }

  next();
};
