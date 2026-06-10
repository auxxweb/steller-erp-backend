/**
 * Generate a URL-safe slug from a string.
 */
export const slugify = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);

export default slugify;
