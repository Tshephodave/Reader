const express = require('express');
const router = express.Router();

const {
  getActivitiesByBook,
  submitActivityResponse,
  getActivityProgress,
  createActivity,
  updateActivity,
  getActivityQuestions,
  deleteActivity,
  moveActivity,
} = require('../controllers/activityController');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

// Anyone signed in
router.get('/book/:bookId', authMiddleware, getActivitiesByBook);
router.get('/:activityId/questions', authMiddleware, getActivityQuestions);
router.get('/:activityId/progress', authMiddleware, getActivityProgress);
router.post('/:activityId/submit', authMiddleware, submitActivityResponse);

// Admin only
router.post('/', authMiddleware, adminMiddleware, createActivity);
router.put('/:id', authMiddleware, adminMiddleware, updateActivity);
router.put('/:id/position', authMiddleware, adminMiddleware, moveActivity);
router.delete('/:id', authMiddleware, adminMiddleware, deleteActivity);

module.exports = router;
