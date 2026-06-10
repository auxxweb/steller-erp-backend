import env from '../../config/env.js';
import { getCloudinary } from '../../config/cloudinary.js';
import {
  IMAGE_THUMB_TRANSFORMATION,
  IMAGE_UPLOAD_TRANSFORMATION,
} from './constants.js';

const dataUriFromBuffer = (buffer, mimeType) =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

const formatUploadResult = (result) => ({
  publicId: result.public_id,
  url: result.secure_url,
  width: result.width,
  height: result.height,
  format: result.format,
  resourceType: result.resource_type,
  bytes: result.bytes,
  thumbnailUrl:
    result.resource_type === 'image'
      ? getCloudinary().url(result.public_id, {
          secure: true,
          transformation: [IMAGE_THUMB_TRANSFORMATION],
        })
      : result.secure_url,
  createdAt: result.created_at,
});

/**
 * Upload a single file buffer to Cloudinary with optional compression.
 */
export const uploadBuffer = async ({
  buffer,
  mimeType,
  folder,
  resourceType = 'auto',
  transformation,
  filename,
  tags = [],
}) => {
  const cloudinary = getCloudinary();
  const isImage = mimeType?.startsWith('image/');
  const uploadTransformation =
    transformation ?? (isImage ? [IMAGE_UPLOAD_TRANSFORMATION] : undefined);

  const result = await cloudinary.uploader.upload(dataUriFromBuffer(buffer, mimeType), {
    folder,
    resource_type: resourceType,
    transformation: uploadTransformation,
    use_filename: Boolean(filename),
    unique_filename: true,
    overwrite: false,
    tags,
  });

  return formatUploadResult(result);
};

/**
 * Upload multiple files in parallel.
 */
export const uploadBuffers = async (files, options) => {
  const uploads = files.map((file) =>
    uploadBuffer({
      buffer: file.buffer,
      mimeType: file.mimetype,
      filename: file.originalname,
      ...options,
    }),
  );

  const results = await Promise.allSettled(uploads);

  const uploaded = [];
  const failed = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      uploaded.push(result.value);
    } else {
      failed.push({
        filename: files[index]?.originalname,
        reason: result.reason?.message || 'Upload failed',
      });
    }
  });

  return { uploaded, failed };
};

/**
 * Generate a short-lived signed upload signature (optional direct uploads).
 */
export const createSignedUploadParams = ({ folder, resourceType = 'image' }) => {
  const cloudinary = getCloudinary();
  const timestamp = Math.round(Date.now() / 1000);

  const params = {
    timestamp,
    folder,
    resource_type: resourceType,
  };

  const signature = cloudinary.utils.api_sign_request(params, env.cloudinaryApiSecret);

  return {
    timestamp,
    folder,
    signature,
    apiKey: env.cloudinaryApiKey,
    cloudName: env.cloudinaryCloudName,
    resourceType,
  };
};

export default uploadBuffer;
