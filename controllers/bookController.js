const Book = require('../models/Book');
const User = require('../models/User');
const Request = require('../models/Request');
const Bookmark = require('../models/Bookmark');
const Highlight = require('../models/Highlight');
const StickyNote = require('../models/StickyNote');
const Activity = require('../models/Activity');
const PageItem = require('../models/PageItem');
const Recording = require('../models/Recording');
const Media = require('../models/Media');
const ActivityResponse = require('../models/ActivityResponse');
const { HttpError, assertObjectId } = require('../utils/http');
const { assertCanOpenBook } = require('../utils/access');
const { parsePdf, parseImage, parseLevel, assertTotalSize, stripDataUrl } = require('../utils/files');

const withoutFile = (book) => {
  const { file, ...rest } = book.toObject ? book.toObject() : book;
  return rest;
};

exports.uploadBook = async (req, res) => {
  const title = String(req.body.title || '').trim();
  const language = String(req.body.language || '').trim();

  if (!title || !language) throw new HttpError(400, 'Title and language are required');
  if (!req.body.file) throw new HttpError(400, 'PDF file is required');

  const file = parsePdf(req.body.file);
  const coverImage = req.body.coverImage ? parseImage(req.body.coverImage, 'Cover image') : '';
  const backCoverImage = req.body.backCoverImage
    ? parseImage(req.body.backCoverImage, 'Back cover image')
    : '';
  const level = req.body.level ? parseLevel(req.body.level) : 'B';
  assertTotalSize(file, coverImage, backCoverImage);

  const book = await Book.create({
    title,
    language,
    level,
    file,
    coverImage,
    backCoverImage,
    uploadedBy: req.user.id,
  });

  res.status(201).json({ msg: 'Book uploaded successfully', book: withoutFile(book) });
};

exports.updateBook = async (req, res) => {
  assertObjectId(req.params.id);
  const book = await Book.findById(req.params.id);
  if (!book) throw new HttpError(404, 'Book not found');

  const { title, language, level, file, coverImage, backCoverImage } = req.body;

  if (title !== undefined) {
    if (!String(title).trim()) throw new HttpError(400, 'Title cannot be empty');
    book.title = String(title).trim();
  }
  if (language !== undefined) {
    if (!String(language).trim()) throw new HttpError(400, 'Language cannot be empty');
    book.language = String(language).trim();
  }
  if (level !== undefined) book.level = parseLevel(level);
  else if (!['B', 'C', 'D'].includes(book.level)) book.level = 'B'; // older books saved as level A
  // Only re-validate what actually changed, so editing a title never fails
  // because of an older cover image that predates the current size limits.
  let contentChanged = false;
  if (file) {
    book.file = parsePdf(file);
    contentChanged = true;
  }
  if (coverImage !== undefined && coverImage !== book.coverImage) {
    book.coverImage = coverImage ? parseImage(coverImage, 'Cover image') : '';
    contentChanged = true;
  }
  if (backCoverImage !== undefined && backCoverImage !== book.backCoverImage) {
    book.backCoverImage = backCoverImage ? parseImage(backCoverImage, 'Back cover image') : '';
    contentChanged = true;
  }

  if (contentChanged) assertTotalSize(book.file, book.coverImage, book.backCoverImage);
  await book.save();

  res.json({ msg: 'Book updated successfully', book: withoutFile(book) });
};

// The list deliberately leaves out the PDF itself: it can be many MB per book
// and used to be sent to every user on every page load.
exports.getBooks = async (req, res) => {
  const books = await Book.find().select('-file').sort({ createdAt: -1 }).lean();
  res.json(books);
};

const sendPdf = (res, book, { attachment }) => {
  const buffer = Buffer.from(stripDataUrl(book.file), 'base64');
  const headers = {
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
    'Cache-Control': 'private, max-age=300',
  };
  if (attachment) {
    const safeName = String(book.title).replace(/[^\w\-. ]+/g, '_').trim() || 'book';
    headers['Content-Disposition'] =
      `attachment; filename="${safeName}.pdf"; filename*=UTF-8''${encodeURIComponent(book.title)}.pdf`;
  }
  res.set(headers);
  res.send(buffer);
};

// Raw PDF bytes for the in-app reader.
// Reading AND downloading both need a teacher's yes (an approved access request).
// Being logged in is not enough. Teachers (admins) can always open every book.
const assertCanOpen = (req, book) => assertCanOpenBook(req, book._id);

exports.getBookFile = async (req, res) => {
  assertObjectId(req.params.id);
  const book = await Book.findById(req.params.id).select('title file');
  if (!book || !book.file) throw new HttpError(404, 'Book not found');
  await assertCanOpen(req, book);
  sendPdf(res, book, { attachment: false });
};

exports.downloadBook = async (req, res) => {
  assertObjectId(req.params.id);
  const book = await Book.findById(req.params.id).select('title file');
  if (!book || !book.file) throw new HttpError(404, 'Book not found');

  await assertCanOpen(req, book);

  await User.updateOne({ _id: req.user.id }, { $addToSet: { downloaded: book._id } });
  sendPdf(res, book, { attachment: true });
};

exports.deleteBook = async (req, res) => {
  assertObjectId(req.params.id);
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) throw new HttpError(404, 'Book not found');

  // Clean up everything that pointed at this book.
  await Promise.all([
    Request.deleteMany({ bookId: book._id }),
    Bookmark.deleteMany({ bookId: String(book._id) }),
    Highlight.deleteMany({ bookId: book._id }),
    StickyNote.deleteMany({ bookId: book._id }),
    Activity.deleteMany({ bookId: book._id }),
    PageItem.deleteMany({ bookId: book._id }),
    Recording.deleteMany({ bookId: book._id }),
    Media.deleteMany({ bookId: book._id }),
    ActivityResponse.deleteMany({ bookId: book._id }),
    User.updateMany(
      {},
      {
        $pull: { favorites: book._id, downloaded: book._id, recentlyViewed: book._id },
        $unset: { [`lastPages.${book._id}`]: '' },
      }
    ),
  ]);

  res.json({ msg: 'Book deleted' });
};
