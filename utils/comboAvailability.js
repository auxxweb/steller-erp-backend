import Product from '../models/Product.js';
import { PRODUCT_STATUS } from '../models/constants/enums.js';
import { validateProductAvailability } from './rentalAvailability.js';

/**
 * How many full combo sets can be fulfilled given per-product availability (network pool).
 */
export const validateComboAvailability = async ({
  combo,
  startAt,
  endAt,
  excludeRentalId = null,
}) => {
  const productIds = combo.items.map((i) => i.product?._id || i.product);
  const products = await Product.find({ _id: { $in: productIds } }).select(
    'name sku status pricing branch',
  );

  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  const itemResults = [];
  let maxCombos = Infinity;

  for (const entry of combo.items) {
    const productId = entry.product?._id?.toString() || entry.product?.toString();
    const product = productMap.get(productId);
    const requiredQty = entry.quantity || 1;

    if (!product) {
      itemResults.push({
        productId,
        requiredPerCombo: requiredQty,
        isAvailable: false,
        error: 'Product not found',
      });
      maxCombos = 0;
      continue;
    }

    if (product.status !== PRODUCT_STATUS.ACTIVE) {
      itemResults.push({
        productId,
        productName: product.name,
        requiredPerCombo: requiredQty,
        isAvailable: false,
        error: 'Product is not active',
      });
      maxCombos = 0;
      continue;
    }

    const availability = await validateProductAvailability({
      productId: product._id,
      quantity: requiredQty,
      startAt,
      endAt,
      excludeRentalId,
    });

    const combosPossible = Math.floor(availability.availableCount / requiredQty);
    maxCombos = Math.min(maxCombos, combosPossible);

    itemResults.push({
      productId,
      productName: product.name,
      sku: product.sku,
      requiredPerCombo: requiredQty,
      ...availability,
      combosPossible,
      isAvailable: availability.isAvailable,
    });
  }

  if (maxCombos === Infinity) maxCombos = 0;

  return {
    comboId: combo._id,
    isAvailable: maxCombos >= 1 && itemResults.every((i) => i.isAvailable),
    availableComboSets: maxCombos,
    window: { startAt, endAt },
    items: itemResults,
    bottleneck: itemResults.reduce(
      (min, i) => (i.combosPossible < min ? i.combosPossible : min),
      maxCombos,
    ),
  };
};

export default validateComboAvailability;
