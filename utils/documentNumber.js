/**
 * Generate unique document numbers with prefix.
 */
export const generateDocumentNumber = async (Model, field, prefix, branchCode = 'BR') => {
  const code = (branchCode || 'BR').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
  let attempt = 0;

  while (attempt < 8) {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    const number = `${prefix}-${code}-${random}`;
    const exists = await Model.findOne({ [field]: number }).select('_id').lean();
    if (!exists) return number;
    attempt += 1;
  }

  return `${prefix}-${code}-${Date.now().toString(36).toUpperCase()}`;
};
