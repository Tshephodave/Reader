module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || 500;
  let msg = err.message;

  if (err.type === 'entity.too.large') {
    status = 413;
    msg = 'Upload is too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    msg = 'Invalid JSON body.';
  } else if (err.name === 'CastError') {
    status = 400;
    msg = 'Invalid id.';
  } else if (err.name === 'ValidationError') {
    status = 400;
  } else if (err.code === 11000) {
    status = 409;
    msg = 'That already exists.';
  }

  if (status >= 500) {
    console.error(err);
    msg = 'Something went wrong on the server.';
  }

  // `msg` and `message` are both returned because the frontend reads either.
  res.status(status).json({ msg, message: msg });
};
