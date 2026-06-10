/**
 * Parse raw QR scan text into lookup hints.
 * Supports: stellar://unit/{id}, MongoDB ObjectId, stored qrPayload, serial in query format.
 */
export const parseQrPayload = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return { error: 'Empty scan data' };
  }

  const value = raw.trim();

  // stellar://unit/507f1f77bcf86cd799439011
  const stellarMatch = value.match(/^stellar:\/\/unit\/([a-f\d]{24})$/i);
  if (stellarMatch) {
    return { unitId: stellarMatch[1], qrPayload: value };
  }

  // https://app.example.com/scan/unit/507f...
  const urlMatch = value.match(/\/scan\/unit\/([a-f\d]{24})(?:\?|$|\/)/i);
  if (urlMatch) {
    return { unitId: urlMatch[1] };
  }

  // Raw 24-char ObjectId
  if (/^[a-f\d]{24}$/i.test(value)) {
    return { unitId: value };
  }

  // JSON payload { "unitId": "..." } or { "type": "stellar_unit", "id": "..." }
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed.unitId) return { unitId: String(parsed.unitId) };
      if (parsed.id) return { unitId: String(parsed.id) };
    } catch {
      // fall through
    }
  }

  // Full qrPayload string stored on unit
  if (value.startsWith('stellar://')) {
    return { qrPayload: value };
  }

  return { qrPayload: value, serialNumber: value };
};

export default parseQrPayload;
