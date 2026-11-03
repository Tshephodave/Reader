const express = require('express');
const router = express.Router();
const { getBookmarks, toggleBookmark,deleteBookmark } = require('../controllers/bookmarkController');
const { authMiddleware } = require('../middlewares/auth');

// Get bookmarks
router.get('/', authMiddleware, getBookmarks);
router.post('/', authMiddleware, toggleBookmark);
router.delete('/delete', authMiddleware, deleteBookmark);

module.exports = router;
