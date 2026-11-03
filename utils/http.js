// Small helpers shared by controllers.
const mongoose = require('mongoose');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const assertObjectId = (value, label = 'id') => {
  if (!mongoose.isValidObjectId(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { HttpError, assertObjectId, escapeRegex };
