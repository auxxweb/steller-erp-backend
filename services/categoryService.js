import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { CATEGORY_STATUS } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { applyDatePeriodFilter } from '../utils/datePeriodFilters.js';
import { slugify } from '../utils/slugify.js';

const BRANCH_POPULATE = { path: 'branch', select: 'name code' };

const formatCategory = (doc) => doc.toPublicJSON();

/** Optional location tag on category — does not restrict visibility. */
const resolveCategoryBranch = (branchFromPayload) => {
  if (
    branchFromPayload === null ||
    branchFromPayload === '' ||
    branchFromPayload === 'global'
  ) {
    return null;
  }
  return branchFromPayload;
};

const ensureUniqueSlug = async (slug, excludeId = null) => {
  const filter = { slug };
  if (excludeId) filter._id = { $ne: excludeId };

  const existing = await Category.findOne(filter);
  if (existing) {
    throw new AppError('Category slug already exists', 409);
  }
};

export const getCategoryStats = async (actor, query = {}) => {
  const filter = buildListFilter(actor, query);

  const [statusCounts, total] = await Promise.all([
    Category.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Category.countDocuments(filter),
  ]);

  const byStatus = Object.values(CATEGORY_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  statusCounts.forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });

  return { total, byStatus };
};

const buildListFilter = (_actor, query = {}) => {
  const filter = {};

  if (query.branch === 'global') {
    filter.branch = null;
  } else if (query.branch) {
    filter.branch = query.branch;
  }

  if (query.status) filter.status = query.status;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { slug: regex }, { description: regex }];
  }

  applyDatePeriodFilter(filter, query, 'createdAt');
  return filter;
};

export const listCategories = async (query = {}, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  const filter = buildListFilter(actor, query);

  const sortField = query.sortBy || 'sortOrder';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
  const sort = { [sortField]: sortOrder, name: 1 };

  const [categories, total] = await Promise.all([
    Category.find(filter).populate(BRANCH_POPULATE).sort(sort).skip(skip).limit(limit),
    Category.countDocuments(filter),
  ]);

  return {
    categories: categories.map(formatCategory),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getCategoryById = async (id, _actor) => {
  const category = await Category.findById(id).populate(BRANCH_POPULATE);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
};

export const createCategory = async (payload, actor) => {
  const branchId = resolveCategoryBranch(payload.branch);
  const slug = (payload.slug?.trim() || slugify(payload.name)).toLowerCase();

  if (!slug) {
    throw new AppError('Could not generate a valid slug', 400);
  }

  await ensureUniqueSlug(slug);

  const category = await Category.create({
    name: payload.name.trim(),
    slug,
    description: payload.description?.trim(),
    image: payload.image?.trim() || undefined,
    status: payload.status || CATEGORY_STATUS.ACTIVE,
    branch: branchId,
    sortOrder: payload.sortOrder ?? 0,
    createdBy: actor._id,
  });

  await category.populate(BRANCH_POPULATE);
  return category;
};

export const updateCategory = async (id, payload, actor) => {
  const category = await getCategoryById(id, actor);

  if (payload.name !== undefined) category.name = payload.name.trim();

  if (payload.slug !== undefined || payload.name !== undefined) {
    const slug = (payload.slug?.trim() || slugify(payload.name ?? category.name)).toLowerCase();
    if (!slug) throw new AppError('Could not generate a valid slug', 400);
    await ensureUniqueSlug(slug, category._id);
    category.slug = slug;
  }

  if (payload.description !== undefined) {
    category.description = payload.description?.trim() || undefined;
  }

  if (payload.image !== undefined) {
    category.image = payload.image?.trim() || undefined;
  }

  if (payload.status !== undefined) category.status = payload.status;
  if (payload.sortOrder !== undefined) category.sortOrder = payload.sortOrder;

  if (payload.branch !== undefined) {
    category.branch = resolveCategoryBranch(payload.branch);
  }

  await category.save();
  await category.populate(BRANCH_POPULATE);
  return category;
};

export const deleteCategory = async (id, actor) => {
  const category = await getCategoryById(id, actor);

  const [productCount, childCount] = await Promise.all([
    Product.countDocuments({ category: category._id }),
    Category.countDocuments({ parent: category._id }),
  ]);

  if (productCount > 0 || childCount > 0) {
    category.status = CATEGORY_STATUS.INACTIVE;
    await category.save();
    return {
      category: formatCategory(category),
      softDeleted: true,
      message:
        'Category has linked products or subcategories and was marked inactive instead of deleted.',
    };
  }

  await Category.findByIdAndDelete(category._id);
  return {
    category: formatCategory(category),
    softDeleted: false,
    message: 'Category deleted successfully',
  };
};
