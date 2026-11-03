const express = require('express');
const router = express.Router();
const {
  getStickyNotes,
  addStickyNote,
  updateStickyNote,
  deleteStickyNote
} = require('../controllers/stickyNoteController');
const { authMiddleware } = require('../middlewares/auth');

router.get('/', authMiddleware, getStickyNotes);
router.post('/', authMiddleware, addStickyNote);
router.put('/:id', authMiddleware, updateStickyNote);
router.delete('/:id', authMiddleware, deleteStickyNote);

module.exports = router;
