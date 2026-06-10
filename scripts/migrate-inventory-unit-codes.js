/**
 * Align existing seeded units: serialNumber + qrPayload = asset id (STLR-*).
 * Manufacturer serial from the sheet moves to notes.
 *
 * Usage: npm run migrate:inventory-codes
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import ProductUnit from '../models/ProductUnit.js';
import { readInventoryTsvFile } from '../utils/parseInventoryTsv.js';
import { assignUnitQrPayload } from '../utils/qrcode.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, '../data/stellar-inventory.tsv');

const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
const filePath = fileArg ? path.resolve(process.cwd(), fileArg) : DEFAULT_FILE;

const buildNotes = (row, existingNotes) => {
  const line = row.manufacturerSerial ? `Manufacturer serial: ${row.manufacturerSerial}` : '';
  if (!line) return existingNotes?.trim() || undefined;
  if (existingNotes?.includes(line)) return existingNotes.trim();
  return existingNotes?.trim() ? `${existingNotes.trim()}\n${line}` : line;
};

async function main() {
  await connectDB();
  const rows = readInventoryTsvFile(filePath);
  let updated = 0;
  let notFound = 0;

  for (const row of rows) {
    const targetCode = row.unitCode || row.qrCode || row.id;
    const legacySerial = row.manufacturerSerial;

    const unit =
      (await ProductUnit.findOne({ qrPayload: targetCode })) ||
      (await ProductUnit.findOne({ assetTag: targetCode.toUpperCase() })) ||
      (await ProductUnit.findOne({ serialNumber: targetCode })) ||
      (legacySerial &&
        (await ProductUnit.findOne({ serialNumber: legacySerial }))) ||
      (await ProductUnit.findOne({
        qrPayload: new RegExp(`^${targetCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      }));

    if (!unit) {
      notFound += 1;
      continue;
    }

    unit.serialNumber = targetCode;
    unit.assetTag = targetCode.toUpperCase();
    unit.notes = buildNotes(row, unit.notes);
    await assignUnitQrPayload(unit, targetCode, { assetTag: targetCode });
    updated += 1;
  }

  console.log('[migrate:inventory-codes] Done');
  console.log(`  Rows in file: ${rows.length}`);
  console.log(`  Units updated: ${updated}`);
  console.log(`  Rows with no matching unit: ${notFound}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate:inventory-codes] Failed:', err.message);
  process.exit(1);
});
