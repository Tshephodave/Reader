const PageItem = require('../models/PageItem');
const Media = require('../models/Media');
const Book = require('../models/Book');
const Recording = require('../models/Recording');
const { HttpError, assertObjectId } = require('../utils/http');
const { parseYouTubeId } = require('../utils/media');
const { assertCanOpenBook } = require('../utils/access');

const TYPES = ['audio', 'image', 'video', 'hotspot', 'text', 'record'];
const TEXT_STYLES = ['card', 'note', 'dark', 'plain'];
const TEXT_SIZES = ['small', 'medium', 'large'];
const SHAPES = ['circle', 'box', 'icon'];
const MEDIA_KIND = { audio: 'audio', image: 'image', video: 'video', hotspot: 'audio', text: 'audio' }; // a text box may also be read aloud

const num = (v, lo, hi, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, `${label} must be between ${lo} and ${hi}.`);
  return Math.round(n * 100) / 100;
};
const text = (v, max, label) => {
  const s = String(v == null ? '' : v).trim();
  if (s.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters).`);
  return s;
};

// A file may only be used on the book it was uploaded for, and only as the right kind of thing.
const checkMedia = async (id, bookId, type) => {
  if (!id) return '';
  assertObjectId(id, 'media id');
  const ok = await Media.exists({ _id: id, bookId, kind: MEDIA_KIND[type] });
  if (!ok) throw new HttpError(400, `That ${MEDIA_KIND[type]} file does not belong to this book.`);
  return String(id);
};

// Cleans one item. `base` is the existing item when editing (only sent fields change).
const clean = async (body, bookId, type, base = {}) => {
  const has = (k) => body[k] !== undefined;
  const out = {};

  if (has('pageIndex')) out.pageIndex = Math.round(num(body.pageIndex, 0, 100000, 'Page'));
  if (has('x')) out.x = num(body.x, 0, 100, 'x');
  if (has('y')) out.y = num(body.y, 0, 100, 'y');
  if (has('label')) out.label = text(body.label, 120, 'The label');
  if (has('mediaId')) out.mediaId = await checkMedia(body.mediaId, bookId, type);

  if (type === 'image') {
    if (has('w')) out.w = num(body.w, 4, 100, 'Width');
  }
  if (type === 'record') {
    if (has('maxSeconds')) out.maxSeconds = Math.round(num(body.maxSeconds, 10, 600, 'The recording time'));
  }
  if (type === 'text') {
    if (has('w')) out.w = num(body.w, 8, 100, 'Width');
    if (has('text')) out.text = text(body.text, 1000, 'The text');
    if (has('style')) {
      if (!TEXT_STYLES.includes(body.style)) throw new HttpError(400, 'Style must be card, note, dark or plain.');
      out.style = body.style;
    }
    if (has('size')) {
      if (!TEXT_SIZES.includes(body.size)) throw new HttpError(400, 'Size must be small, medium or large.');
      out.size = body.size;
    }
  }
  if (type === 'video') {
    if (has('youtubeUrl')) {
      const url = String(body.youtubeUrl || '').trim();
      const id = url ? parseYouTubeId(url) : '';
      if (url && !id) throw new HttpError(400, 'That does not look like a YouTube link.');
      out.youtubeId = id || '';
      if (id) out.mediaId = ''; // one source at a time
    }
    if (has('start')) out.start = Math.round(num(body.start || 0, 0, 86400, 'Start time'));
    if (has('end')) out.end = Math.round(num(body.end || 0, 0, 86400, 'End time'));
    if (out.mediaId) out.youtubeId = '';
    const start = out.start !== undefined ? out.start : base.start || 0;
    const end = out.end !== undefined ? out.end : base.end || 0;
    if (end && end <= start) throw new HttpError(400, 'The end time must be after the start time.');
  }
  if (type === 'hotspot') {
    if (has('shape')) {
      if (!SHAPES.includes(body.shape)) throw new HttpError(400, 'Shape must be circle, box or icon.');
      out.shape = body.shape;
    }
    if (has('visible')) out.visible = Boolean(body.visible);
    if (has('color')) {
      if (!/^#[0-9a-fA-F]{6}$/.test(String(body.color))) throw new HttpError(400, 'Colour must look like #ff4fa3.');
      out.color = String(body.color).toLowerCase();
    }
    if (has('w')) out.w = num(body.w, 3, 100, 'Width');
    if (has('h')) out.h = num(body.h, 3, 100, 'Height');
    if (has('text')) out.text = text(body.text, 1000, 'The text');
  }
  return out;
};

const removeMedia = async (ids) => {
  const list = ids.filter(Boolean);
  if (list.length) await Media.deleteMany({ _id: { $in: list } });
};

exports.getItemsByBook = async (req, res) => {
  assertObjectId(req.params.bookId, 'book id');
  await assertCanOpenBook(req, req.params.bookId);
  const items = await PageItem.find({ bookId: req.params.bookId }).sort({ pageIndex: 1, createdAt: 1 }).lean();
  res.json(items);
};

exports.createItem = async (req, res) => {
  const { bookId, type } = req.body;
  assertObjectId(bookId, 'book id');
  if (!TYPES.includes(type)) throw new HttpError(400, 'Type must be audio, image, video, hotspot, text or record.');
  if (req.body.pageIndex === undefined) throw new HttpError(400, 'Choose a page.');
  if (!(await Book.exists({ _id: bookId }))) throw new HttpError(404, 'Book not found');

  const fields = await clean(req.body, bookId, type);
  const item = await PageItem.create({ bookId, type, ...fields });
  res.status(201).json(item);
};

exports.updateItem = async (req, res) => {
  assertObjectId(req.params.id);
  const item = await PageItem.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Item not found');

  const fields = await clean(req.body, item.bookId, item.type, item);
  const oldMedia = item.mediaId;
  Object.assign(item, fields);
  await item.save();
  if (fields.mediaId !== undefined && oldMedia && oldMedia !== item.mediaId) await removeMedia([oldMedia]);
  res.json(item);
};

exports.deleteItem = async (req, res) => {
  assertObjectId(req.params.id);
  const item = await PageItem.findByIdAndDelete(req.params.id);
  if (!item) throw new HttpError(404, 'Item not found');
  await removeMedia([item.mediaId]);
  await Recording.deleteMany({ itemId: item._id }); // learners' readings for a spot that no longer exists
  res.json({ msg: 'Deleted' });
};
