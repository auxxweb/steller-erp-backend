import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';

let configured = false;

export const isCloudinaryConfigured = () =>
  Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);

export const configureCloudinary = () => {
  if (!isCloudinaryConfigured()) {
    return false;
  }

  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });

  configured = true;
  return true;
};

export const assertCloudinaryConfigured = () => {
  if (!configureCloudinary()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }
};

export const getCloudinary = () => {
  assertCloudinaryConfigured();
  return cloudinary;
};

export default cloudinary;
