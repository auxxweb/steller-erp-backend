/** Upload resource kinds — used for folder layout and validation */
export const UPLOAD_RESOURCE = {
  PRODUCT: 'product',
  CUSTOMER: 'customer',
  MAINTENANCE: 'maintenance',
  CATEGORY: 'category',
  USER: 'user',
  GENERAL: 'general',
};

export const UPLOAD_ROOT_FOLDER = 'stellar-erp';

export const UPLOAD_FOLDERS = {
  [UPLOAD_RESOURCE.PRODUCT]: `${UPLOAD_ROOT_FOLDER}/products`,
  [UPLOAD_RESOURCE.CUSTOMER]: `${UPLOAD_ROOT_FOLDER}/customers`,
  [UPLOAD_RESOURCE.MAINTENANCE]: `${UPLOAD_ROOT_FOLDER}/maintenance`,
  [UPLOAD_RESOURCE.CATEGORY]: `${UPLOAD_ROOT_FOLDER}/categories`,
  [UPLOAD_RESOURCE.USER]: `${UPLOAD_ROOT_FOLDER}/users`,
  [UPLOAD_RESOURCE.GENERAL]: `${UPLOAD_ROOT_FOLDER}/misc`,
};

/** Image MIME types */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

/** Customer documents — images + PDF */
export const DOCUMENT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
];

export const UPLOAD_LIMITS = {
  imageMaxBytes: 10 * 1024 * 1024,
  documentMaxBytes: 15 * 1024 * 1024,
  productMaxFiles: 10,
  maintenanceMaxFiles: 10,
  customerMaxFiles: 5,
  userMaxFiles: 5,
  categoryMaxFiles: 1,
};

/** Default Cloudinary transformations for compression & delivery */
export const IMAGE_UPLOAD_TRANSFORMATION = {
  quality: 'auto:good',
  fetch_format: 'auto',
  width: 2000,
  crop: 'limit',
};

export const IMAGE_THUMB_TRANSFORMATION = {
  quality: 'auto:good',
  fetch_format: 'auto',
  width: 400,
  height: 400,
  crop: 'fill',
  gravity: 'auto',
};
