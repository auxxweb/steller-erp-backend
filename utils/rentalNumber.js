import Rental from '../models/Rental.js';

/**
 * Generate unique rental number: RNT-{BRANCH}-{RANDOM}
 */
export const generateRentalNumber = async (branchCode = 'BR') => {
  const prefix = (branchCode || 'BR').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
  let attempt = 0;

  while (attempt < 8) {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    const rentalNumber = `RNT-${prefix}-${random}`;
    const exists = await Rental.findOne({ rentalNumber }).select('_id').lean();
    if (!exists) return rentalNumber;
    attempt += 1;
  }

  return `RNT-${prefix}-${Date.now().toString(36).toUpperCase()}`;
};

export default generateRentalNumber;
