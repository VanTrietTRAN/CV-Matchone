const express = require('express');
const router = express.Router();
const { validateObjectIdParam } = require('../middleware/validateObjectId');
router.param('id', validateObjectIdParam);
router.param('companyUserId', validateObjectIdParam);
const { protect, optionalAuth, authorize } = require('../middleware/authMiddleware');
const {
  createReview,
  getCompanyReviews,
  getMyReviewStatus,
  updateReview,
  deleteReview,
  replyToReview,
  adminListReviews,
  adminSetHidden,
} = require('../controllers/companyReviewController');

// Admin kiểm duyệt (đặt trước /:id để tránh nhầm route)
router.get('/admin/all', protect, authorize('admin'), adminListReviews);
router.patch('/admin/:id/hide', protect, authorize('admin'), adminSetHidden);

router.post('/', protect, createReview);
// Công khai: trang chi tiết việc làm mở cho khách. `protect` ở đây trước đây trả
// 401 và frontend đá khách chưa đăng nhập về /login.
router.get('/company/:companyUserId', optionalAuth, getCompanyReviews);
router.get('/company/:companyUserId/me', protect, getMyReviewStatus);
router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);
router.post('/:id/reply', protect, replyToReview);

module.exports = router;
