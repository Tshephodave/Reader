const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');
const {
  uploadBook,
  getBooks,
  getBookFile,
  downloadBook,
  deleteBook,
  updateBook,
} = require('../controllers/bookController');

router.get('/', authMiddleware, getBooks);
router.get('/:id/file', authMiddleware, getBookFile);
router.get('/:id/download', authMiddleware, downloadBook);

router.post('/', authMiddleware, adminMiddleware, uploadBook);
router.put('/:id', authMiddleware, adminMiddleware, updateBook);
router.delete('/:id', authMiddleware, adminMiddleware, deleteBook);

module.exports = router;
