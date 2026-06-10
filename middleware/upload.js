import multer from 'multer';
import AppError from '../utils/AppError.js';
import {
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  UPLOAD_LIMITS,
} from '../utils/cloudinary/constants.js';

const memoryStorage = multer.memoryStorage();

const fileFilter =
  (allowedMimes) =>
  (_req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`File type not allowed: ${file.mimetype}`, 400), false);
    }
  };

const multerErrorHandler = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File exceeds maximum upload size', 400));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError('Too many files in upload request', 400));
    }
    return next(new AppError(err.message, 400));
  }
  return next(err);
};

export const uploadImages = (fieldName = 'images', maxCount = UPLOAD_LIMITS.productMaxFiles) => {
  const upload = multer({
    storage: memoryStorage,
    limits: { fileSize: UPLOAD_LIMITS.imageMaxBytes, files: maxCount },
    fileFilter: fileFilter(IMAGE_MIME_TYPES),
  }).array(fieldName, maxCount);

  return [upload, multerErrorHandler];
};

export const uploadImageSingle = (fieldName = 'image') => {
  const upload = multer({
    storage: memoryStorage,
    limits: { fileSize: UPLOAD_LIMITS.imageMaxBytes, files: 1 },
    fileFilter: fileFilter(IMAGE_MIME_TYPES),
  }).single(fieldName);

  return [upload, multerErrorHandler];
};

export const uploadDocuments = (
  fieldName = 'documents',
  maxCount = UPLOAD_LIMITS.customerMaxFiles,
) => {
  const upload = multer({
    storage: memoryStorage,
    limits: { fileSize: UPLOAD_LIMITS.documentMaxBytes, files: maxCount },
    fileFilter: fileFilter(DOCUMENT_MIME_TYPES),
  }).array(fieldName, maxCount);

  return [upload, multerErrorHandler];
};

export default uploadImages;
