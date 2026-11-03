const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HttpError, escapeRegex } = require('../utils/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compared against when the email is unknown, so response time doesn't reveal
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Case-insensitive so accounts created before emails were lower-cased still work.
const findByEmail = (email) =>
  User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });

exports.register = async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (username.length < 2) throw new HttpError(400, 'Username must be at least 2 characters.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

  if (await findByEmail(email)) {
    throw new HttpError(409, 'An account with this email already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  // The role is never taken from the request: everyone who registers is a
  // customer. Create admins with `npm run create-admin`.
  await User.create({ username, email, password: hashedPassword, role: 'customer' });

  res.status(201).json({ msg: 'User registered' });
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = email ? await findByEmail(email) : null;
  const match = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

  if (!user || !match) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  const token = jwt.sign(
    { id: user._id, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
  res.json({ token, role: user.role, username: user.username });
};

// Tokens are stateless, so logging out is handled by the client discarding it.
exports.logout = (req, res) => {
  res.json({ msg: 'Logged out successfully' });
};
