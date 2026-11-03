const Bookmark = require('../models/Bookmark');

// Get bookmarks for the logged-in user
exports.getBookmarks = async (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.query;

  try {
    const filter = { userId };
    if (bookId) {
      filter.bookId = bookId;
    }

    const bookmarks = await Bookmark.find(filter);
    return res.status(200).json(bookmarks);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Toggle bookmark for the logged-in user
exports.toggleBookmark = async (req, res) => {
  const userId = req.user.id;
  const { bookId, pageIndex } = req.body;

  if (!bookId || pageIndex == null) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const existing = await Bookmark.findOne({ userId, bookId, pageIndex });

    if (existing) {
      await existing.deleteOne();
      return res.status(200).json({ message: 'Bookmark removed' });
    }

    const newBookmark = new Bookmark({ userId, bookId, pageIndex });
    await newBookmark.save();

    return res.status(201).json({ message: 'Bookmark added', bookmark: newBookmark });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.deleteBookmark = async (req, res) => {
  const userId = req.user.id;
  const { bookId, pageIndex } = req.body;

  if (!bookId || pageIndex == null) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const bookmark = await Bookmark.findOne({ userId, bookId, pageIndex });

    if (!bookmark) {
      return res.status(404).json({ message: 'Bookmark not found' });
    }

    await bookmark.deleteOne();
    return res.status(200).json({ message: 'Bookmark successfully deleted' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
