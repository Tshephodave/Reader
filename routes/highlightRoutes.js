const express = require('express');
const router = express.Router();
const {getHighlights,createHighlight,deleteHighlight} = require('../controllers/highlightController');
const {authMiddleware} = require('../middlewares/auth');

router.get('/', authMiddleware, getHighlights);
router.post('/', authMiddleware, createHighlight);
router.delete('/:id', authMiddleware, deleteHighlight);

module.exports = router;
