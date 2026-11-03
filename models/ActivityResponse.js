// models/ActivityResponse.js
const mongoose = require('mongoose');

const questionResponseSchema = new mongoose.Schema({
  questionId: { type: String, required: true }, // Reference to question in activity
  userAnswer: { type: String, required: true },
  isCorrect: { type: Boolean },
  pointsEarned: { type: Number, default: 0 }
});

const activityResponseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', required: true },
  pageIndex: { type: Number, required: true },
  responses: [questionResponseSchema], // Array of responses for each question
  isCompleted: { type: Boolean, default: false },
  totalPointsEarned: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now }
});

// Compound index for efficient queries
activityResponseSchema.index({ userId: 1, bookId: 1, activityId: 1 }, { unique: true });

module.exports = mongoose.model('ActivityResponse', activityResponseSchema);