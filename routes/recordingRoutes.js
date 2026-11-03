const express = require('express');
const router = express.Router();
const { listMine, saveRecording, getAudio, deleteRecording } = require('../controllers/recordingController');
const { authMiddleware } = require('../middlewares/auth');

router.get('/book/:bookId', authMiddleware, listMine);
router.get('/:id/audio', authMiddleware, getAudio);
router.put('/:itemId', authMiddleware, express.raw({ type: () => true, limit: '14mb' }), saveRecording);
router.delete('/:itemId', authMiddleware, deleteRecording);

module.exports = router;
