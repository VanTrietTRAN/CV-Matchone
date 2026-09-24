const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getStats,
  getUsers,
  updateUserStatus,
  updateUserPro,
  getEmployerOptions,
  deleteUser,
  getJobs,
  closeJob,
  deleteJob,
  getSystemInfo,
  checkEmailConnection,
  getEmailTemplates,
  updateEmailTemplates,
  previewEmailTemplate,
  triggerMatchingJob,
  getEmailSettings,
  updateEmailSettings,
  getAuditLogs,
  getAiMonitor,
  retryCvAi,
  retryAllFailedCvAi,
  createBroadcast,
  getBroadcasts,
  resetUserPasswordByAdmin,
} = require('../controllers/adminController');
const {
  getAnalyticsOverview,
  getEmployerUsage,
} = require('../controllers/analyticsController');

router.use(protect, authorize('admin'));

router.get('/stats', getStats);

// Thống kê có lọc theo thời gian + khối lượng sử dụng theo từng doanh nghiệp
router.get('/analytics', getAnalyticsOverview);
router.get('/analytics/employers', getEmployerUsage);
router.get('/audit-logs', getAuditLogs);

router.get('/ai-monitor', getAiMonitor);
router.post('/ai-monitor/:id/retry', retryCvAi);
router.post('/ai-monitor/retry-all-failed', retryAllFailedCvAi);

router.get('/broadcast', getBroadcasts);
router.post('/broadcast', createBroadcast);

router.get('/users', getUsers);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/pro', updateUserPro);
router.post('/users/:id/reset-password-request', resetUserPasswordByAdmin);
router.delete('/users/:id', deleteUser);

// Danh sách doanh nghiệp cho ô chọn "tin thuộc về ai" ở trang import tin
router.get('/employers', getEmployerOptions);

router.get('/jobs', getJobs);
router.patch('/jobs/:id/close', closeJob);
router.delete('/jobs/:id', deleteJob);

router.get('/system', getSystemInfo);
// ─── Import hàng loạt từ Excel ───────────────────────────────────────────────
const sheetUpload = require('../middleware/sheetUploadMiddleware');
const { importUsers, importEmployers, importJobs, downloadTemplate } = require('../controllers/importController');
router.get('/import/template/:kind', downloadTemplate);
router.post('/import/users', sheetUpload.single('file'), importUsers);
router.post('/import/employers', sheetUpload.single('file'), importEmployers);
router.post('/import/jobs', sheetUpload.single('file'), importJobs);

const { getWelcomeEmailQueue, retryWelcomeEmails } = require('../controllers/adminController');
router.get('/import/welcome-queue', getWelcomeEmailQueue);
router.post('/import/welcome-queue/retry', retryWelcomeEmails);

router.get('/system/email-check', checkEmailConnection);
router.get('/system/email-templates', getEmailTemplates);
router.put('/system/email-templates', updateEmailTemplates);
router.post('/system/email-templates/:key/preview', previewEmailTemplate);
router.get('/system/email-settings', getEmailSettings);
router.put('/system/email-settings', updateEmailSettings);
router.post('/trigger-matching', triggerMatchingJob);

module.exports = router;
