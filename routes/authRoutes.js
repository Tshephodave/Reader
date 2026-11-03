const express = require('express');
const router = express.Router();
const { register, login, logout } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many sign-ups from this address. Please try again later.',
});

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', authMiddleware, logout);

module.exports = router;
