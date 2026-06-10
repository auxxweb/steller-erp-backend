/**
 * Project-wide customer identity — one phone / email per customer record.
 */

export const normalizePhone = (phone) => {
  if (phone == null || phone === '') return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  // India: compare on last 10 digits when long enough; otherwise full digit string
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
};

export const normalizeEmail = (email) => {
  if (email == null) return null;
  const trimmed = String(email).trim().toLowerCase();
  return trimmed || null;
};

export const phonesMatch = (a, b) => {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return Boolean(na && nb && na === nb);
};
