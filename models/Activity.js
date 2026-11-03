// models/Activity.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: { 
    type: String, 
    enum: ['multiple-choice', 'true-false', 'open-ended', 'fill-blank'],
    required: true 
  },
  options: [String], // For multiple-choice
  correctAnswer: String, // For checking (optional for open-ended)
  instructions: String,
  hint: String,
  correctFeedback: { type: String, default: 'Great job! Your answer is correct!' },
  incorrectFeedback: { type: String, default: 'Not quite right. Try again!' },
  audioId: { type: String, default: '' },        // the question, read aloud (an uploaded sound)
  answerAudioId: { type: String, default: '' },  // plays after the learner answers
  optionImages: { type: [String], default: [] }, // a picture for each choice, same order as options ('' = none)
  points: { type: Number, default: 10 },
  order: { type: Number, required: true } // To maintain question order
});

const activitySchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  pageIndex: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  questions: [questionSchema], // Array of questions
  instructions: String, // General instructions for the entire activity
  x: { type: Number, default: null }, // where the quiz badge sits on the page (% of the page); null = default spot
  y: { type: Number, default: null },
  totalPoints: { type: Number, default: 0 }, // Auto-calculated sum of all question points
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-calculate total points before saving
activitySchema.pre('save', function(next) {
  if (this.questions && this.questions.length > 0) {
    this.totalPoints = this.questions.reduce((sum, question) => sum + (question.points || 0), 0);
  }
  next();
});

// Index for faster queries by book and page
activitySchema.index({ bookId: 1, pageIndex: 1 });

module.exports = mongoose.model('Activity', activitySchema);