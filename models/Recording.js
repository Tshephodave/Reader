const mongoose = require('mongoose');

// A learner's own voice while practising reading. One per learner per "Record" spot:
// recording again replaces the old one. Private to that learner.
const recordingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'PageItem', required: true, index: true },
  pageIndex: { type: Number, default: 0 },
  mime: { type: String, required: true },
  size: { type: Number, required: true },
  durationMs: { type: Number, default: 0 },
  data: { type: Buffer, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
});

recordingSchema.index({ userId: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model('Recording', recordingSchema);
