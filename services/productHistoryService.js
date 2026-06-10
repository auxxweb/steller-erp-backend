import ProductHistory from '../models/ProductHistory.js';

export const logProductHistory = async ({
  product,
  productUnit = null,
  branch = null,
  action,
  summary,
  changes = null,
  metadata = null,
  performedBy,
}) => {
  try {
    const entry = await ProductHistory.create({
      product,
      productUnit,
      branch,
      action,
      summary,
      changes,
      metadata,
      performedBy,
    });
    return entry;
  } catch (err) {
    console.error('[productHistory] Failed to write:', err.message);
    return null;
  }
};

export const listProductHistory = async (filter, { page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    ProductHistory.find(filter)
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductHistory.countDocuments(filter),
  ]);

  return {
    history: entries.map((e) => e.toPublicJSON()),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
};

export default logProductHistory;
