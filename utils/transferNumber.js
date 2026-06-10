import Transfer from '../models/Transfer.js';

/**
 * Generate unique transfer number: TRF-{BRANCH}-{RANDOM}
 */
export const generateTransferNumber = async (branchCode = 'BR') => {
  const prefix = (branchCode || 'BR').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
  let attempt = 0;

  while (attempt < 8) {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    const transferNumber = `TRF-${prefix}-${random}`;
    const exists = await Transfer.findOne({ transferNumber }).select('_id').lean();
    if (!exists) return transferNumber;
    attempt += 1;
  }

  return `TRF-${prefix}-${Date.now().toString(36).toUpperCase()}`;
};

export default generateTransferNumber;
