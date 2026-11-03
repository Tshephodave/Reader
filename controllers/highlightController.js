const Highlight = require('../models/Highlight');

exports.getHighlights = async (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.query;

  try {
    const filter = { userId };
    if(bookId) filter.bookId = bookId;
  
    const highlights = await Highlight.find(filter);
     return res.status(200).json(highlights);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.createHighlight = async (req, res) => {
  const userId = req.user.id;
  const { bookId, pageIndex, x, y, width, height, color } = req.body;

  if (!bookId || pageIndex == null || x == null || y == null || width == null || height == null) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newHighlight = new Highlight({
      userId,
      bookId,
      pageIndex,
      x,
      y,
      width,
      height,
      color
    });

    await newHighlight.save();
    res.status(201).json(newHighlight);
  } catch (err) {
    console.error('Create highlight error:', err);
    res.status(500).json({ message: 'Failed to create highlight' });
  }
};

exports.deleteHighlight = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const deleted = await Highlight.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      return res.status(404).json({ message: 'Highlight not found' });
    }

    res.json({ message: 'Highlight deleted' });
  } catch (err) {
    console.error('Delete highlight error:', err);
    res.status(500).json({ message: 'Failed to delete highlight' });
  }
};
