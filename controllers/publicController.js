// What a visitor who is NOT logged in (or has not been approved yet) can see:
// the front cover on the shelf, and ONLY the back cover when they peek inside.
// The book itself is never sent from here.
const Book = require('../models/Book');
const { HttpError, assertObjectId } = require('../utils/http');

exports.listBooks = async (req, res) => {
  const books = await Book.find()
    .select('title language level coverImage createdAt')
    .sort({ createdAt: -1 })
    .lean();
  // Level A no longer exists: older books saved as A are shown as B.
  res.json(books.map((b) => ({ ...b, level: ['B', 'C', 'D'].includes(b.level) ? b.level : 'B' })));
};

exports.getPreview = async (req, res) => {
  assertObjectId(req.params.id);
  const book = await Book.findById(req.params.id)
    .select('title language level backCoverImage')
    .lean();
  if (!book) throw new HttpError(404, 'Book not found');
  res.json({
    _id: book._id,
    title: book.title,
    language: book.language,
    level: ['B', 'C', 'D'].includes(book.level) ? book.level : 'B',
    backCoverImage: book.backCoverImage || '',
  });
};
