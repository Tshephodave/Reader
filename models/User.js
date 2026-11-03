const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'customer'], default: 'customer' },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    downloaded: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    recentlyViewed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    // Where the reader stopped in each book: { <bookId>: pageIndex } (0 = first page)
    lastPages: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
