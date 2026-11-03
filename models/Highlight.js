const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  pageIndex: {
    type: Number,
    required: true
  },
  x: Number,
  y: Number,
  width: Number,
  height: Number,
  color: {
    type: String,
    default: '#FFFF00'
  },
createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Highlight', highlightSchema);
