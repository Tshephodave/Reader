const mongoose = require('mongoose');

// One uploaded audio / image / video file. The bytes live in `data` (kept out of normal queries).
const mediaSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  kind: { type: String, enum: ['audio', 'image', 'video'], required: true },
  mime: { type: String, required: true },
  size: { type: Number, required: true },
  name: { type: String, default: '' },
  data: { type: Buffer, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Media', mediaSchema);
