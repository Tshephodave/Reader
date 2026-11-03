// Uploading and serving the audio / pictures / videos teachers put into a book.
const Media = require('../models/Media');
const Book = require('../models/Book');
const { HttpError, assertObjectId } = require('../utils/http');
const { LIMITS, KINDS, detectMime } = require('../utils/media');
const { assertCanOpenBook } = require('../utils/access');

// The file arrives as the raw request body (no base64), so big videos stay small on the wire.
exports.uploadMedia = async (req, res) => {
  const { bookId, kind } = req.query;
  assertObjectId(bookId, 'book id');
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Kind must be audio, image or video.');

  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, 'Please choose a file to upload.');
  if (data.length > LIMITS[kind]) {
    throw new HttpError(413, `That ${kind} file is too big (max ${Math.round(LIMITS[kind] / 1024 / 1024)} MB).`);
  }
  const mime = detectMime(data, kind);
  if (!mime) throw new HttpError(400, `That doesn't look like a ${kind} file I can play. Try ${kind === 'audio' ? 'MP3, M4A, WAV or OGG' : kind === 'image' ? 'JPEG, PNG, GIF or WebP' : 'MP4 or WebM'}.`);
  if (!(await Book.exists({ _id: bookId }))) throw new HttpError(404, 'Book not found');

  let name = '';
  try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')).trim().slice(0, 120); } catch (e) { name = ''; }

  const media = await Media.create({ bookId, kind, mime, size: data.length, name, data });
  res.status(201).json({ id: String(media._id), kind, mime, size: data.length, name });
};

exports.getMedia = async (req, res) => {
  assertObjectId(req.params.id, 'media id');
  const media = await Media.findById(req.params.id).select('+data');
  if (!media) throw new HttpError(404, 'File not found');
  await assertCanOpenBook(req, media.bookId);

  res.set({
    'Content-Type': media.mime,
    'Content-Length': String(media.data.length),
    'X-Content-Type-Options': 'nosniff',
    // The id never changes what is inside, so the browser may keep it.
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.send(media.data);
};
