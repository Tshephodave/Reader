const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  bookId: { type: String, required: true },
  pageIndex: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

bookmarkSchema.index({ userId: 1, bookId: 1, pageIndex: 1 });

module.exports = mongoose.model('Bookmark', bookmarkSchema);
