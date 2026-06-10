import fs from 'fs';

const HEADER = [
  'id',
  'qrCode',
  'productName',
  'category',
  'brand',
  'modelNumber',
  'serialNumber',
  'rentalPrice',
];

const normalizeCategoryName = (name) => {
  const trimmed = name.trim();
  if (/^acessories$/i.test(trimmed)) return 'Accessories';
  return trimmed;
};

const normalizeAssetId = (id) => {
  let value = (id || '').trim().toUpperCase();
  if (value.startsWith('STKR-')) value = `STLR-${value.slice(5)}`;
  return value;
};

/**
 * Parse tab-separated inventory export into row objects.
 */
export const parseInventoryTsv = (content) => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0].split('\t').map((h) => h.trim());
  const hasHeader = HEADER.every((col, i) => header[i]?.toLowerCase() === col.toLowerCase());
  const start = hasHeader ? 1 : 0;

  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const parts = lines[i].split('\t');
    if (parts.length < 8) continue;

    const [
      id,
      qrCode,
      productName,
      category,
      brand,
      modelNumber,
      serialNumber,
      rentalPrice,
    ] = parts;

    const unitCode = normalizeAssetId(qrCode || id);
    const manufacturerSerial = String(serialNumber).trim();

    rows.push({
      id: unitCode,
      qrCode: unitCode,
      unitCode,
      manufacturerSerial,
      productName: productName.trim(),
      category: normalizeCategoryName(category),
      brand: brand.trim(),
      modelNumber: modelNumber.trim(),
      /** @deprecated use unitCode — kept for callers expecting serialNumber column */
      serialNumber: manufacturerSerial,
      rentalPrice: Number(rentalPrice) || 0,
      rowIndex: i,
    });
  }

  return rows;
};

export const readInventoryTsvFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseInventoryTsv(content);
};

export default parseInventoryTsv;
