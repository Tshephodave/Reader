const express = require('express');
const router = express.Router();
const { listBooks, getPreview } = require('../controllers/publicController');

// No login needed: covers and the first pages only.
router.get('/books', listBooks);
router.get('/books/:id/preview', getPreview);

module.exports = router;
