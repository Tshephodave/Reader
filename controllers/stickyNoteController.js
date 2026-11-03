const StickyNote = require('../models/StickyNote');

exports.getStickyNotes = async (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.query;

  try {
    const filter = { userId };
    if (bookId) filter.bookId = bookId;

    const notes = await StickyNote.find(filter);
    return res.status(200).json(notes);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.addStickyNote = async (req, res) => {
  const userId = req.user.id;
  const {
    bookId,
    pageIndex,
    text,
    color,
    x,
    y,
    width,
    height
  } = req.body;

  if (!bookId || pageIndex == null || !text || !color || x == null || y == null || width == null || height == null) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newNote = new StickyNote({
      userId,
      bookId,
      pageIndex,
      text,
      color,
      x,
      y,
      width,
      height,
    });

    await newNote.save();
    return res.status(201).json(newNote);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.updateStickyNote = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Only these fields can be changed by the client.
  const updates = {};
  for (const field of ['text', 'color', 'x', 'y', 'width', 'height']) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  try {
    const note = await StickyNote.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    );

    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    return res.status(200).json(note);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.deleteStickyNote = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const note = await StickyNote.findOneAndDelete({ _id: id, userId });

    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    return res.status(200).json({ message: 'Sticky note deleted' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
