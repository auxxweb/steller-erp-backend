/**
 * Import categories, products, and serial units from backend/data/stellar-inventory.tsv
 *
 * Usage:
 *   npm run seed:inventory
 *   node scripts/seed-inventory-catalog.js --file=./data/custom.tsv --branch=MUM
 *   node scripts/seed-inventory-catalog.js --clear   # remove prior seeded units/products (by asset tag prefix)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import User from '../models/User.js';
import {
  CATEGORY_STATUS,
  INVENTORY_SCOPE,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_UNIT_STATUS,
  ROLES,
} from '../models/constants/enums.js';
import { ensureCommonInventoryBranch } from '../services/branchService.js';
import Branch from '../models/Branch.js';
import { slugify } from '../utils/slugify.js';
import { readInventoryTsvFile } from '../utils/parseInventoryTsv.js';
import { assignUnitQrPayload } from '../utils/qrcode.js';
import { syncProductUnitCounts } from '../utils/productInventory.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, '../data/stellar-inventory.tsv');

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1];
const branchArg = args.find((a) => a.startsWith('--branch='))?.split('=')[1];
const shouldClear = args.includes('--clear');

const productKey = (row) =>
  [
    row.category.toLowerCase(),
    row.productName.toLowerCase(),
    row.brand.toLowerCase(),
    row.modelNumber.toLowerCase(),
  ].join('|');

const buildSku = (row, usedSkus) => {
  const base = slugify(`${row.brand}-${row.modelNumber}`).replace(/-/g, '').slice(0, 24).toUpperCase();
  let sku = base || slugify(row.productName).slice(0, 24).toUpperCase();
  let n = 1;
  while (usedSkus.has(sku)) {
    sku = `${base.slice(0, 20)}${n}`.toUpperCase();
    n += 1;
  }
  usedSkus.add(sku);
  return sku;
};

/**
 * Unit serial + QR payload = asset id (e.g. STLR-CAM-001).
 * On duplicate asset ids, suffix with manufacturer serial or row index.
 */
const resolveUnitIdentity = (row, usedCodes) => {
  const base = (row.unitCode || row.qrCode || row.id).trim();
  if (!usedCodes.has(base)) {
    usedCodes.add(base);
    return { unitCode: base, qrPayload: base };
  }
  const suffix = row.manufacturerSerial || `R${row.rowIndex}`;
  const alt = `${base}#${suffix}`;
  usedCodes.add(alt);
  return { unitCode: alt, qrPayload: alt };
};

const buildUnitNotes = (row) => {
  if (!row.manufacturerSerial) return undefined;
  return `Manufacturer serial: ${row.manufacturerSerial}`;
};

async function resolveBranch() {
  if (branchArg) {
    const branch = await Branch.findOne({ code: branchArg.toUpperCase() });
    if (!branch) throw new Error(`Branch not found: ${branchArg}`);
    return branch;
  }
  return ensureCommonInventoryBranch();
}

async function resolveActor() {
  const admin =
    (await User.findOne({ role: ROLES.SUPER_ADMIN, status: 'active' })) ||
    (await User.findOne({ role: ROLES.SUPER_ADMIN }));
  return admin;
}

async function clearSeededInventory(branchId) {
  const units = await ProductUnit.find({
    branch: branchId,
    $or: [{ assetTag: /^STLR-/ }, { serialNumber: /^STLR-/ }, { qrPayload: /^STLR-/ }],
  }).select('_id product');

  const productIds = [...new Set(units.map((u) => u.product.toString()))];
  await ProductUnit.deleteMany({ _id: { $in: units.map((u) => u._id) } });
  await Product.deleteMany({ _id: { $in: productIds } });
  console.log(`[seed:inventory] Cleared ${units.length} units and ${productIds.length} products`);
}

async function main() {
  const filePath = fileArg ? path.resolve(process.cwd(), fileArg) : DEFAULT_FILE;

  await connectDB();

  const branch = await resolveBranch();
  const actor = await resolveActor();
  const rows = readInventoryTsvFile(filePath);

  if (rows.length === 0) {
    console.error('[seed:inventory] No rows parsed from', filePath);
    process.exit(1);
  }

  if (shouldClear) {
    await clearSeededInventory(branch._id);
  }

  const categoryBySlug = new Map();
  const productByKey = new Map();
  const usedSkus = new Set(
    (await Product.find({ branch: branch._id }).select('sku')).map((p) => p.sku),
  );
  const usedUnitCodes = new Set(
    (await ProductUnit.find({ branch: branch._id }).select('serialNumber')).map(
      (u) => u.serialNumber,
    ),
  );

  let categoriesCreated = 0;
  let productsCreated = 0;
  let unitsCreated = 0;
  let unitsSkipped = 0;

  for (const row of rows) {
    const catSlug = slugify(row.category);
    let category = categoryBySlug.get(catSlug);

    if (!category) {
      let existing = await Category.findOne({ slug: catSlug });
      if (!existing) {
        existing = await Category.create({
          name: row.category,
          slug: catSlug,
          status: CATEGORY_STATUS.ACTIVE,
          branch: null,
          createdBy: actor?._id,
        });
        categoriesCreated += 1;
      }
      category = existing;
      categoryBySlug.set(catSlug, category);
    }

    const pKey = productKey(row);
    let product = productByKey.get(pKey);

    if (!product) {
      product = await Product.findOne({
        branch: branch._id,
        name: row.productName,
        'specs.brand': row.brand,
        'specs.model': row.modelNumber,
      });

      if (!product) {
        const sku = buildSku(row, usedSkus);
        product = await Product.create({
          name: row.productName,
          sku,
          branch: branch._id,
          inventoryScope: INVENTORY_SCOPE.COMMON,
          category: category._id,
          type: PRODUCT_TYPE.RENTAL,
          status: PRODUCT_STATUS.ACTIVE,
          trackUnits: true,
          pricing: {
            individual: {
              dailyRate: row.rentalPrice,
            },
          },
          specs: {
            brand: row.brand,
            model: row.modelNumber,
            serializable: true,
          },
          createdBy: actor?._id,
          updatedBy: actor?._id,
        });
        productsCreated += 1;
      }
      productByKey.set(pKey, product);
    }

    const { unitCode, qrPayload } = resolveUnitIdentity(row, usedUnitCodes);

    const existingUnit = await ProductUnit.findOne({
      $or: [
        { qrPayload },
        { branch: branch._id, serialNumber: unitCode },
        ...(row.manufacturerSerial
          ? [{ branch: branch._id, serialNumber: row.manufacturerSerial }]
          : []),
      ],
    });

    if (existingUnit) {
      unitsSkipped += 1;
      continue;
    }

    const unit = await ProductUnit.create({
      product: product._id,
      branch: branch._id,
      serialNumber: unitCode,
      assetTag: unitCode.toUpperCase(),
      notes: buildUnitNotes(row),
      status: PRODUCT_UNIT_STATUS.AVAILABLE,
      createdBy: actor?._id,
    });

    await assignUnitQrPayload(unit, qrPayload, { assetTag: unitCode });
    unitsCreated += 1;
  }

  for (const product of productByKey.values()) {
    await syncProductUnitCounts(product._id);
  }

  console.log('[seed:inventory] Done');
  console.log(`  Branch: ${branch.code} (${branch.name})`);
  console.log(`  Rows parsed: ${rows.length}`);
  console.log(`  Categories (+new): ${categoryBySlug.size} (${categoriesCreated} created)`);
  console.log(`  Products (+new): ${productByKey.size} (${productsCreated} created)`);
  console.log(`  Units created: ${unitsCreated}, skipped: ${unitsSkipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:inventory] Failed:', err.message);
  process.exit(1);
});
