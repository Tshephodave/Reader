// Who may open a book's content (the PDF, the audio/images/videos on its pages, its quizzes).
// Being logged in is not enough: a teacher has to approve the reader's request first.
// Teachers (admins) can always open everything.
const Request = require('../models/Request');
const { HttpError } = require('./http');

exports.assertCanOpenBook = async (req, bookId) => {
  if (req.user.role === 'admin') return;
  const approved = await Request.exists({ userId: req.user.id, bookId, status: 'approved' });
  if (!approved) {
    throw new HttpError(403, 'You need a teacher to say yes first. Tap “Request access” on the book.');
  }
};
