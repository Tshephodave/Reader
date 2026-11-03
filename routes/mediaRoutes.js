const express = require('express');
const router = express.Router();
const { uploadMedia, getMedia } = require('../controllers/mediaController');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

// Readers who have been approved can fetch a file; only teachers can upload.
router.get('/:id', authMiddleware, getMedia);
router.post('/', authMiddleware, adminMiddleware, express.raw({ type: () => true, limit: '16mb' }), uploadMedia);

module.exports = router;
