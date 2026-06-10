import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import { PRODUCT_UNIT_STATUS } from '../models/constants/enums.js';

/**
 * Recalculate product totalUnits / availableUnits from units collection.
 */
export const syncProductUnitCounts = async (productId) => {
  const productOid = productId;

  const [totalUnits, availableUnits, byStatus] = await Promise.all([
    ProductUnit.countDocuments({
      product: productOid,
      status: { $ne: PRODUCT_UNIT_STATUS.RETIRED },
    }),
    ProductUnit.countDocuments({
      product: productOid,
      status: PRODUCT_UNIT_STATUS.AVAILABLE,
    }),
    ProductUnit.aggregate([
      { $match: { product: productOid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  await Product.findByIdAndUpdate(productId, { totalUnits, availableUnits });

  const statusBreakdown = Object.values(PRODUCT_UNIT_STATUS).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  byStatus.forEach(({ _id, count }) => {
    if (_id) statusBreakdown[_id] = count;
  });

  return { totalUnits, availableUnits, byStatus: statusBreakdown };
};

export default syncProductUnitCounts;
