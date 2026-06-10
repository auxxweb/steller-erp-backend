import { getCloudinary } from '../../config/cloudinary.js';
import { normalizePublicId } from './parsePublicId.js';

/**
 * Delete a single asset by public_id or Cloudinary URL.
 */
export const deleteAsset = async (publicIdOrUrl, { resourceType = 'image' } = {}) => {
  const cloudinary = getCloudinary();
  const publicId = normalizePublicId(publicIdOrUrl);

  if (!publicId) {
    throw new Error('Invalid public ID or Cloudinary URL');
  }

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });

  return {
    publicId,
    result: result.result,
  };
};

/**
 * Delete multiple assets; returns per-item outcomes.
 */
export const deleteAssets = async (items = []) => {
  const outcomes = await Promise.allSettled(
    items.map(({ publicId, url, resourceType = 'image' }) =>
      deleteAsset(publicId || url, { resourceType }),
    ),
  );

  const deleted = [];
  const failed = [];

  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      deleted.push(outcome.value);
    } else {
      failed.push({
        publicId: items[index]?.publicId,
        url: items[index]?.url,
        reason: outcome.reason?.message || 'Delete failed',
      });
    }
  });

  return { deleted, failed };
};

export default deleteAsset;
