// Reading practice: learners record themselves reading, and listen back later.
const Recording = require('../models/Recording');
const PageItem = require('../models/PageItem');
const { HttpError, assertObjectId } = require('../utils/http');
const { detectMime } = require('../utils/media');
const { assertCanOpenBook } = require('../utils/access');

const MAX_BYTES = 12 * 1024 * 1024;
const SHOW = 'itemId size durationMs createdAt mime pageIndex';

const meta = (r) => ({ id: String(r._id), itemId: String(r.itemId), size: r.size, durationMs: r.durationMs, createdAt: r.createdAt, mime: r.mime });

// My recordings in this book (no sound data, just what is needed to show "you have one here").
exports.listMine = async (req, res) => {
  assertObjectId(req.params.bookId, 'book id');
  await assertCanOpenBook(req, req.params.bookId);
  const list = await Recording.find({ userId: req.user.id, bookId: req.params.bookId }).select(SHOW).lean();
  res.json(list.map(meta));
};

// Save (or replace) my recording for one Record spot. The sound arrives as the raw request body.
exports.saveRecording = async (req, res) => {
  assertObjectId(req.params.itemId, 'item id');
  const item = await PageItem.findById(req.params.itemId).select('bookId type pageIndex maxSeconds');
  if (!item || item.type !== 'record') throw new HttpError(404, 'This page has no recording spot.');
  await assertCanOpenBook(req, item.bookId);

  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, 'There is no recording to save.');
  if (data.length > MAX_BYTES) throw new HttpError(413, 'That recording is too long to save.');
  const mime = detectMime(data, 'audio');
  if (!mime) throw new HttpError(400, 'That does not look like a recording I can play.');

  const limit = ((item.maxSeconds || 120) + 5) * 1000;
  const durationMs = Math.min(Math.max(Math.round(Number(req.query.durationMs)) || 0, 0), limit);

  const saved = await Recording.findOneAndUpdate(
    { userId: req.user.id, itemId: item._id },
    { userId: req.user.id, bookId: item.bookId, itemId: item._id, pageIndex: item.pageIndex, mime, size: data.length, durationMs, data, createdAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select(SHOW);
  res.status(201).json(meta(saved));
};

// Only the learner who made it (or a teacher) can hear a recording.
exports.getAudio = async (req, res) => {
  assertObjectId(req.params.id, 'recording id');
  const rec = await Recording.findById(req.params.id).select('+data userId mime');
  if (!rec || (req.user.role !== 'admin' && String(rec.userId) !== String(req.user.id))) throw new HttpError(404, 'Recording not found');
  res.set({
    'Content-Type': rec.mime,
    'Content-Length': String(rec.data.length),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store', // a re-recording keeps the same spot, so never reuse an old copy
  });
  res.send(rec.data);
};

exports.deleteRecording = async (req, res) => {
  assertObjectId(req.params.itemId, 'item id');
  await Recording.deleteOne({ userId: req.user.id, itemId: req.params.itemId });
  res.json({ msg: 'Deleted' });
};
