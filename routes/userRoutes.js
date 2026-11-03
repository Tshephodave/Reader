const express = require('express');
const router = express.Router();
const { getMe, toggleFavorite, addRecentlyViewed, getProgress, saveProgress } = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/auth');

router.get('/me', authMiddleware, getMe);
router.post('/favorites/:bookId', authMiddleware, toggleFavorite);
router.post('/recently-viewed/:bookId', authMiddleware, addRecentlyViewed);
router.get('/progress/:bookId', authMiddleware, getProgress);
router.put('/progress/:bookId', authMiddleware, saveProgress);

module.exports = router;
