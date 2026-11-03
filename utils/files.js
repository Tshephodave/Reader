// Validation for the base64 payloads the admin dashboard uploads.
// Books are stored inside MongoDB documents, which have a hard 16 MB limit,
// so the limits below are chosen to keep file + covers safely under it.
const { HttpError } = require('./http');

const MAX_PDF_BYTES = 10 * 1024 * 1024; // decoded size
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // decoded size, per cover
const MAX_DOC_CHARS = 15 * 1000 * 1000; // pdf + covers, as stored

const stripDataUrl = (s) => String(s).replace(/^data:[^;,]+;base64,/, '');

const decodedSize = (b64) => {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

// Returns clean base64 (no data-URL prefix) — the format already stored in the DB.
const parsePdf = (input) => {
  const b64 = stripDataUrl(input);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw new HttpError(400, 'PDF data is not valid base64.');
  }
  if (!b64.startsWith('JVBER')) {
    // "JVBER" is base64 for "%PDF"
    throw new HttpError(400, 'The uploaded file is not a PDF.');
  }
  if (decodedSize(b64) > MAX_PDF_BYTES) {
    throw new HttpError(400, 'PDF file is too large (max 10 MB).');
  }
  return b64;
};

// Returns the full data URL, which is what the frontend renders directly.
// Covers stored without a "data:" prefix (older uploads) are sniffed and given one.
const parseImage = (input, label) => {
  let value = String(input);

  if (!value.startsWith('data:')) {
    if (value.startsWith('/9j/')) value = `data:image/jpeg;base64,${value}`;
    else if (value.startsWith('iVBORw0KGgo')) value = `data:image/png;base64,${value}`;
  }

  const match = value.match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    throw new HttpError(400, `${label} must be a JPEG or PNG image.`);
  }
  if (decodedSize(match[2]) > MAX_IMAGE_BYTES) {
    throw new HttpError(400, `${label} is too large (max 2 MB).`);
  }
  return value;
};

const parseLevel = (input) => {
  const level = String(input).trim().toUpperCase();
  if (!['B', 'C', 'D'].includes(level)) throw new HttpError(400, 'Level must be B, C or D.');
  return level;
};

const assertTotalSize = (...parts) => {
  const total = parts.reduce((sum, p) => sum + (p ? p.length : 0), 0);
  if (total > MAX_DOC_CHARS) {
    throw new HttpError(400, 'PDF and cover images together are too large to store. Try a smaller PDF.');
  }
};

module.exports = { parsePdf, parseImage, parseLevel, assertTotalSize, stripDataUrl };
