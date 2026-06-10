import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import ProductUnit from '../models/ProductUnit.js';
import Category from '../models/Category.js';
import AppError from '../utils/AppError.js';
import { generateQrBuffer, generateUnitQr } from '../utils/qrcode.js';

const UNIT_POPULATE = [
  { path: 'product', select: 'name sku specs category', populate: { path: 'category', select: 'name slug' } },
  { path: 'branch', select: 'name code' },
];

const formatCatalogUnit = (doc) => {
  const json = doc.toPublicJSON();
  return {
    ...json,
    productName: doc.product?.name,
    categoryName: doc.product?.category?.name,
    assetId: doc.assetTag || doc.qrPayload,
  };
};

const buildListFilter = (query = {}) => {
  const filter = {};

  if (query.branch) filter.branch = query.branch;
  if (query.status) filter.status = query.status;

  if (query.search?.trim()) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { serialNumber: regex },
      { qrPayload: regex },
      { assetTag: regex },
    ];
  }

  return filter;
};

export const listCatalogUnits = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = buildListFilter(query);

  if (query.category) {
    const categories = await Category.find({
      $or: [{ slug: query.category }, { _id: query.category }],
    }).select('_id');
    const categoryIds = categories.map((c) => c._id);
    const productFilter = { category: { $in: categoryIds } };
    const { default: Product } = await import('../models/Product.js');
    const products = await Product.find(productFilter).select('_id');
    filter.product = { $in: products.map((p) => p._id) };
  }

  const [units, total] = await Promise.all([
    ProductUnit.find(filter)
      .populate(UNIT_POPULATE)
      .sort({ qrPayload: 1, serialNumber: 1 })
      .skip(skip)
      .limit(limit),
    ProductUnit.countDocuments(filter),
  ]);

  return {
    units: units.map(formatCatalogUnit),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const getCatalogUnit = async (unitId) => {
  const unit = await ProductUnit.findById(unitId).populate(UNIT_POPULATE);
  if (!unit) throw new AppError('Product unit not found', 404);
  return formatCatalogUnit(unit);
};

const resolveQrPayload = (unit) => {
  if (unit.qrPayload) return unit.qrPayload;
  throw new AppError('Unit has no QR payload', 404);
};

export const getUnitQrImage = async (unitId) => {
  const unit = await ProductUnit.findById(unitId);
  if (!unit) throw new AppError('Product unit not found', 404);

  let payload = unit.qrPayload;
  if (!payload || !unit.qrCode) {
    const qr = await generateUnitQr(unit);
    unit.qrPayload = qr.payload;
    unit.qrCode = qr.dataUrl;
    await unit.save();
    payload = qr.payload;
  }

  const buffer = await generateQrBuffer(payload);
  const filename = `${sanitizeFilename(payload)}.png`;

  return { buffer, filename, payload };
};

export const buildBulkQrZip = async (query = {}) => {
  const filter = buildListFilter(query);

  if (query.category) {
    const categories = await Category.find({
      $or: [{ slug: query.category }, { _id: query.category }],
    }).select('_id');
    const { default: Product } = await import('../models/Product.js');
    const products = await Product.find({ category: { $in: categories.map((c) => c._id) } }).select(
      '_id',
    );
    filter.product = { $in: products.map((p) => p._id) };
  }

  const units = await ProductUnit.find(filter)
    .select('qrPayload serialNumber assetTag product')
    .populate({ path: 'product', select: 'name sku' })
    .sort({ qrPayload: 1 });

  if (units.length === 0) {
    throw new AppError('No units match the selected filters', 404);
  }

  const maxUnits = Math.min(Number(query.max) || 500, 500);
  const slice = units.slice(0, maxUnits);

  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    archive.on('error', reject);

    archive.pipe(stream);

    (async () => {
      const usedNames = new Set();
      for (const unit of slice) {
        const payload = unit.qrPayload || unit.assetTag || unit.serialNumber;
        if (!payload) continue;

        let baseName = sanitizeFilename(payload);
        let fileName = `${baseName}.png`;
        let n = 1;
        while (usedNames.has(fileName)) {
          fileName = `${baseName}-${n}.png`;
          n += 1;
        }
        usedNames.add(fileName);

        const buffer = await generateQrBuffer(payload);
        archive.append(buffer, { name: fileName });
      }

      archive.append(
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            count: slice.length,
            units: slice.map((u) => ({
              qrPayload: u.qrPayload,
              serialNumber: u.serialNumber,
              product: u.product?.name,
            })),
          },
          null,
          2,
        ),
        { name: 'manifest.json' },
      );

      await archive.finalize();
    })().catch(reject);
  });
};

function sanitizeFilename(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

export default {
  listCatalogUnits,
  getCatalogUnit,
  getUnitQrImage,
  buildBulkQrZip,
};
