import AppError from '../utils/AppError.js';

const handleCastError = (err) =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue || {})[0];
  return new AppError(`Duplicate value for ${field}`, 409);
};

const handleValidationError = (err) => {
  const messages = Object.values(err.errors || {}).map((e) => e.message);
  return new AppError('Validation failed', 400, messages);
};

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    errors: err.errors,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      errors: err.errors,
    });
  }

  console.error('[error]', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};

const errorHandler = (err, req, res, _next) => {
  let error = err;

  if (err.name === 'CastError') error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateKey(err);
  if (err.name === 'ValidationError') error = handleValidationError(err);
  if (err.name === 'JsonWebTokenError') error = new AppError('Invalid token', 401);
  if (err.name === 'TokenExpiredError') error = new AppError('Token expired', 401);

  const normalized =
    error instanceof AppError
      ? error
      : new AppError(error.message || 'Internal server error', error.statusCode || 500);

  if (process.env.NODE_ENV === 'development') {
    return sendErrorDev(normalized, res);
  }

  return sendErrorProd(normalized, res);
};

export default errorHandler;
