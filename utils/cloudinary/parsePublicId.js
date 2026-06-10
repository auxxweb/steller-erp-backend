/**
 * Extract Cloudinary public_id from a delivery URL.
 * @param {string} url
 * @returns {string|null}
 */
export const parsePublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('cloudinary.com')) return null;

    const uploadIndex = parsed.pathname.indexOf('/upload/');
    if (uploadIndex === -1) return null;

    let remainder = parsed.pathname.slice(uploadIndex + '/upload/'.length);
    // Strip version segment v1234567890/
    remainder = remainder.replace(/^v\d+\//, '');
    // Strip transformation segments (contain comma or underscore-heavy paths before real folder)
    const segments = remainder.split('/');
    while (segments.length > 1 && /^[a-z0-9_,.-]+$/i.test(segments[0]) && segments[0].includes(',')) {
      segments.shift();
    }

    const last = segments[segments.length - 1];
    const withoutExt = last.replace(/\.[a-zA-Z0-9]+$/, '');
    segments[segments.length - 1] = withoutExt;

    return segments.join('/') || null;
  } catch {
    return null;
  }
};

/**
 * Normalize public_id input (raw id or full URL).
 */
export const normalizePublicId = (value) => {
  if (!value) return null;
  if (value.includes('cloudinary.com')) {
    return parsePublicIdFromUrl(value);
  }
  return value.replace(/\.[a-zA-Z0-9]+$/, '');
};

export default parsePublicIdFromUrl;
