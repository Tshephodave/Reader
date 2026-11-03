const express = require('express');
const router = express.Router();
const {
  createRequest,
  getAllRequests,
  approveRequest,
  rejectRequest,
  getMyRequests,
  getUserApprovedRequests,
} = require('../controllers/requestController');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

router.post('/', authMiddleware, createRequest);
router.get('/', authMiddleware, adminMiddleware, getAllRequests);
router.patch('/:id/approve', authMiddleware, adminMiddleware, approveRequest);
router.patch('/:id/reject', authMiddleware, adminMiddleware, rejectRequest);

router.get('/mine', authMiddleware, getMyRequests);
router.get('/my-approved', authMiddleware, getUserApprovedRequests);

module.exports = router;
