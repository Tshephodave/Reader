const User = require('../models/User');
const Book = require('../models/Book');
const { HttpError, assertObjectId } = require('../utils/http');

const ids = (list) => list.map((id) => String(id));

// Lists for the "Favorites / Downloaded / Recently viewed" tabs.
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id).select('favorites downloaded recentlyViewed lastPages').lean();
  if (!user) throw new HttpError(404, 'User not found');

  res.json({
    favorites: ids(user.favorites || []),
    downloaded: ids(user.downloaded || []),
    recentlyViewed: ids(user.recentlyViewed || []),
    lastPages: user.lastPages || {},
  });
};

exports.toggleFavorite = async (req, res) => {
  const { bookId } = req.params;
  assertObjectId(bookId, 'book id');
  if (!(await Book.exists({ _id: bookId }))) throw new HttpError(404, 'Book not found');

  const user = await User.findById(req.user.id).select('favorites');
  if (!user) throw new HttpError(404, 'User not found');

  const isFavorite = user.favorites.some((id) => String(id) === bookId);
  await User.updateOne(
    { _id: user._id },
    isFavorite ? { $pull: { favorites: bookId } } : { $addToSet: { favorites: bookId } }
  );

  const favorites = isFavorite
    ? ids(user.favorites).filter((id) => id !== bookId)
    : [...ids(user.favorites), bookId];

  res.json({ favorited: !isFavorite, favorites });
};

exports.addRecentlyViewed = async (req, res) => {
  const { bookId } = req.params;
  assertObjectId(bookId, 'book id');
  if (!(await Book.exists({ _id: bookId }))) throw new HttpError(404, 'Book not found');

  // Two steps: Mongo won't $pull and $push the same field in one update.
  await User.updateOne({ _id: req.user.id }, { $pull: { recentlyViewed: bookId } });
  await User.updateOne(
    { _id: req.user.id },
    { $push: { recentlyViewed: { $each: [bookId], $position: 0, $slice: 10 } } }
  );

  res.json({ msg: 'Recently viewed updated' });
};

// Where this person stopped reading a book (page index, 0 = first page).
exports.getProgress = async (req, res) => {
  const { bookId } = req.params;
  assertObjectId(bookId, 'book id');
  const user = await User.findById(req.user.id).select('lastPages').lean();
  if (!user) throw new HttpError(404, 'User not found');
  const page = user.lastPages && user.lastPages[bookId];
  res.json({ pageIndex: Number.isInteger(page) ? page : 0 });
};

exports.saveProgress = async (req, res) => {
  const { bookId } = req.params;
  assertObjectId(bookId, 'book id');
  const pageIndex = req.body && req.body.pageIndex;
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 100000) {
    throw new HttpError(400, 'pageIndex must be a whole number, 0 or more');
  }
  if (!(await Book.exists({ _id: bookId }))) throw new HttpError(404, 'Book not found');

  await User.updateOne({ _id: req.user.id }, { $set: { [`lastPages.${bookId}`]: pageIndex } });
  res.json({ pageIndex });
};
