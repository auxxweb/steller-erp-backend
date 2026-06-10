import QRCode from 'qrcode';
import env from '../config/env.js';

/**
 * Build canonical QR payload for a product unit.
 */
export const buildUnitQrPayload = (unit) => {
  const id = unit._id?.toString() || unit.id;
  return `stellar://unit/${id}`;
};

/**
 * Generate QR code as PNG data URL.
 */
export const generateQrDataUrl = async (payload, options = {}) => {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: options.width || 280,
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });
};

/**
 * Generate QR for a product unit (payload + data URL).
 * Uses existing qrPayload when set (e.g. asset id STLR-CAM-001).
 */
export const generateUnitQr = async (unit, options = {}) => {
  const payload = options.payload || unit.qrPayload || buildUnitQrPayload(unit);
  const dataUrl = await generateQrDataUrl(payload, options);
  const scanUrl = `${env.appUrl}/scan/unit/${unit._id}`;

  return { payload, dataUrl, scanUrl };
};

/**
 * Assign a human-readable QR payload (asset id) and persist image on the unit.
 */
export const assignUnitQrPayload = async (unit, payload, options = {}) => {
  const text = String(payload).trim();
  if (!text) throw new Error('QR payload is required');

  unit.qrPayload = text;
  unit.assetTag = options.assetTag?.trim()?.toUpperCase() || text.toUpperCase();
  const qr = await generateUnitQr(unit, { payload: text, ...options });
  unit.qrCode = qr.dataUrl;
  await unit.save();

  return qr;
};

export const generateQrBuffer = async (payload, options = {}) => {
  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: options.width || 280,
    color: { dark: '#0a0a0a', light: '#ffffff' },
    type: 'png',
  });
};

export default generateUnitQr;
