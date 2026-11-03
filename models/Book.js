const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: String,
  language: String,
  // Reading level: B = 2 stars, C = 3 stars, D = 4 stars. (Older books saved as "A" count as B.)
  level: { type: String, enum: ['B', 'C', 'D'], default: 'B' },
  file: String,
  coverImage: String,
  backCoverImage: String, // ✅ NEW FIELD
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Book', bookSchema);
