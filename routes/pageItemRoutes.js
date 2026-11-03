const express = require('express');
const router = express.Router();
const { getItemsByBook, createItem, updateItem, deleteItem } = require('../controllers/pageItemController');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

router.get('/book/:bookId', authMiddleware, getItemsByBook);
router.post('/', authMiddleware, adminMiddleware, createItem);
router.put('/:id', authMiddleware, adminMiddleware, updateItem);
router.delete('/:id', authMiddleware, adminMiddleware, deleteItem);

module.exports = router;
