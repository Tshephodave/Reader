const mongoose = require('mongoose');

// Something the teacher placed on one page of a book: a sound icon, a picture, a video,
// or a "hotspot" (tap a spot on the picture to see a label / text and hear a word).
// Positions are percentages of the page, so they stay put on any screen.
const pageItemSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  pageIndex: { type: Number, required: true, min: 0 }, // 0 = first page
  type: { type: String, enum: ['audio', 'image', 'video', 'hotspot', 'text', 'record'], required: true },

  x: { type: Number, default: 50 }, // icons: the middle of the icon. pictures/boxes/circles: top-left corner
  y: { type: Number, default: 50 },
  w: { type: Number, default: 8 },  // % of the page width
  h: { type: Number, default: 8 },  // % of the page height (boxes only)

  label: { type: String, default: '' },
  text: { type: String, default: '' },
  mediaId: { type: String, default: '' }, // audio file, picture, or video file (see `type`)

  // video only: a YouTube clip instead of an uploaded file
  youtubeId: { type: String, default: '' },
  start: { type: Number, default: 0 },
  end: { type: Number, default: 0 },

  // hotspot only
  shape: { type: String, enum: ['circle', 'box', 'icon'], default: 'circle' },
  visible: { type: Boolean, default: true },
  color: { type: String, default: '#ff4fa3' },

  // record only: the longest a learner may record, in seconds
  maxSeconds: { type: Number, default: 120 },

  // text only: how the words look
  style: { type: String, enum: ['card', 'note', 'dark', 'plain'], default: 'card' },
  size: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },

  createdAt: { type: Date, default: Date.now },
});

pageItemSchema.index({ bookId: 1, pageIndex: 1 });

module.exports = mongoose.model('PageItem', pageItemSchema);
