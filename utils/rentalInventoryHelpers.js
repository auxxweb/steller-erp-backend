import Branch from '../models/Branch.js';
import ProductUnit from '../models/ProductUnit.js';
import {
  COMMON_INVENTORY_BRANCH_CODE,
  INVENTORY_SCOPE,
  PRODUCT_UNIT_STATUS,
} from '../models/constants/enums.js';

let cachedCommonBranchId = null;

const NON_COUNTED_UNIT_STATUSES = [
  PRODUCT_UNIT_STATUS.RETIRED,
  PRODUCT_UNIT_STATUS.LOST,
];

/**
 * Company-wide pool: every product and serial is rentable from any branch.
 * Branch on product/unit is physical location metadata only.
 */
export const usesSharedProductInventory = () => true;

/** @deprecated Use usesSharedProductInventory — kept for call-site compatibility */
export const isCommonInventoryProduct = () => true;

export const isCommonInventoryBranchRef = (branchRef) => {
  if (!branchRef) return false;
  if (typeof branchRef === 'object' && branchRef.code === COMMON_INVENTORY_BRANCH_CODE) {
    return true;
  }
  return false;
};

export const getCommonInventoryBranchId = async () => {
  if (cachedCommonBranchId) return cachedCommonBranchId;
  const branch = await Branch.findOne({ code: COMMON_INVENTORY_BRANCH_CODE }).select('_id');
  cachedCommonBranchId = branch?._id?.toString() || null;
  return cachedCommonBranchId;
};

/** Legacy helper — returns product home branch id if set (informational). */
export const resolveInventoryBranchId = (product) =>
  product?.branch?._id?.toString() || product?.branch?.toString() || null;

/** Combo stored on the COMMON branch is offered at every rental branch. */
export const isSharedCombo = (comboOrBranchRef) => {
  if (!comboOrBranchRef) return false;
  if (comboOrBranchRef.branch != null) {
    return isCommonInventoryBranchRef(comboOrBranchRef.branch);
  }
  return isCommonInventoryBranchRef(comboOrBranchRef);
};

/** All authenticated roles can use any combo in the catalog. */
export const canActorAccessComboBranch = async () => true;

/**
 * List filter: optional branch narrows to that branch's combos plus shared (COMMON) combos.
 */
export const buildComboBranchFilter = async (_actor, query = {}) => {
  if (!query.branch) return {};

  const commonId = await getCommonInventoryBranchId();

  if (query.branch === 'common' || query.branch === 'shared') {
    return commonId ? { branch: commonId } : {};
  }

  if (commonId && query.branch !== commonId) {
    return { $or: [{ branch: query.branch }, { branch: commonId }] };
  }

  return { branch: query.branch };
};

export const countActiveProductUnits = async (product) =>
  ProductUnit.countDocuments({
    product: product._id,
    status: { $nin: NON_COUNTED_UNIT_STATUSES },
  });

export const resolveObjectIdString = (ref) => {
  if (ref == null) return '';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object') {
    if (ref._id != null) return ref._id.toString();
    if (ref.id != null) return ref.id.toString();
  }
  return ref.toString();
};

export const resolveRefIdString = (ref) => {
  if (ref == null) return '';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object') {
    if (ref._id != null) return ref._id.toString();
    if (ref.id != null) return ref.id.toString();
  }
  return ref.toString();
};

export const rentalItemHasUnit = (item) => {
  const pu = item?.productUnit;
  if (pu == null) return false;
  if (typeof pu === 'object' && (pu._id || pu.id)) return true;
  return Boolean(pu);
};

/**
 * @param locationBranchId — when set, limit to units physically at that branch
 */
export const buildActiveUnitQuery = (
  productId,
  { locationBranchId = null, assignableOnly = false } = {},
) => {
  const filter = {
    product: productId,
    status: assignableOnly
      ? { $in: [PRODUCT_UNIT_STATUS.AVAILABLE, PRODUCT_UNIT_STATUS.RESERVED] }
      : { $nin: NON_COUNTED_UNIT_STATUSES },
  };
  if (locationBranchId) {
    filter.branch = locationBranchId;
  }
  return filter;
};

/** Human-readable location from unit or product branch ref */
export const formatInventoryLocation = (branchRef) => {
  if (!branchRef) return null;
  if (typeof branchRef === 'object') {
    return branchRef.code || branchRef.name || null;
  }
  return null;
};
