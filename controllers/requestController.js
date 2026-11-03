const Request = require('../models/Request');
const Book = require('../models/Book');
const { HttpError, assertObjectId } = require('../utils/http');

// User asks for access to a book.
exports.createRequest = async (req, res) => {
  const { bookId } = req.body;
  assertObjectId(bookId, 'book id');
  if (!(await Book.exists({ _id: bookId }))) throw new HttpError(404, 'Book not found');

  const existing = await Request.findOne({ userId: req.user.id, bookId });

  if (existing) {
    if (existing.status === 'rejected') {
      // Let people ask again after a rejection.
      existing.status = 'pending';
      existing.createdAt = new Date();
      await existing.save();
      return res.status(201).json(existing);
    }
    const msg =
      existing.status === 'approved'
        ? 'You already have access to this book.'
        : 'You already asked. Please wait for a teacher to say yes.';
    throw new HttpError(409, msg);
  }

  const request = await Request.create({ userId: req.user.id, bookId });
  res.status(201).json(request);
};

const setStatus = (status) => async (req, res) => {
  assertObjectId(req.params.id);
  const request = await Request.findById(req.params.id);
  if (!request) throw new HttpError(404, 'Request not found.');

  request.status = status;
  await request.save();
  res.json({ msg: `Request ${status}` });
};

exports.approveRequest = setStatus('approved');
exports.rejectRequest = setStatus('rejected');

// Every request the current user has made, with its status.
exports.getMyRequests = async (req, res) => {
  const requests = await Request.find({ userId: req.user.id }).select('bookId status').lean();
  res.json(requests.map((r) => ({ bookId: String(r.bookId), status: r.status })));
};

// Kept for backwards compatibility: just the approved book ids.
exports.getUserApprovedRequests = async (req, res) => {
  const requests = await Request.find({ userId: req.user.id, status: 'approved' })
    .select('bookId')
    .lean();
  res.json(requests.map((r) => String(r.bookId)));
};

// Admin: all requests, newest first.
exports.getAllRequests = async (req, res) => {
  const requests = await Request.find()
    .sort({ createdAt: -1 })
    .populate('userId', 'username email')
    .populate('bookId', 'title');
  res.json(requests);
};
