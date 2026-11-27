const express = require('express');
const router = express.Router();
const { validateObjectIdParam } = require('../middleware/validateObjectId');
router.param('id', validateObjectIdParam);
router.param('companyUserId', validateObjectIdParam);
const { protect, authorize } = require('../middleware/authMiddleware');
const { updateMySettings, getMyProfile, getEmployerStats, getCompanyProfile, updateCompanyProfile } = require('../controllers/userController');

router.get('/me/profile', protect, getMyProfile);

router.put('/me/settings', protect, updateMySettings);

router.get('/employer/stats', protect, authorize('employer', 'admin'), getEmployerStats);

// Hồ sơ công ty chỉ dành cho nhà tuyển dụng (và admin) — ứng viên từng tạo/sửa được
router.get('/me/company-profile', protect, authorize('employer', 'admin'), getCompanyProfile);

router.put('/me/company-profile', protect, authorize('employer', 'admin'), updateCompanyProfile);

module.exports = router;
