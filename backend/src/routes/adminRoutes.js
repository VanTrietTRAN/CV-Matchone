const express = require('express');
const router = express.Router();
const { validateObjectIdParam } = require('../middleware/validateObjectId');
router.param('id', validateObjectIdParam);
router.param('companyUserId', validateObjectIdParam);
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
// Bản chi tiết của /health (công khai đã rút gọn): DB, email, storage, ?ai=1
router.get('/system/health', getSystemInfo);
// ─── Import hàng loạt từ Excel ───────────────────────────────────────────────
const sheetUpload = require('../middleware/sheetUploadMiddleware');
const { importUsers, importEmployers, importJobs, downloadTemplate } = require('../controllers/importController');
router.get('/import/template/:kind', downloadTemplate);
const rateLimit = require('express-rate-limit');
const adminImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Import quá nhiều lần. Vui lòng thử lại sau 15 phút.' },
});
router.post('/import/users', adminImportLimiter, sheetUpload.single('file'), importUsers);
router.post('/import/employers', adminImportLimiter, sheetUpload.single('file'), importEmployers);
router.post('/import/jobs', adminImportLimiter, sheetUpload.single('file'), importJobs);

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

// ─── Đường gửi mail: 3 làn, warm-up, Circuit Breaker ─────────────────────────
const emailHealth = require('../controllers/emailHealthController');
router.get('/system/email-health', emailHealth.getEmailHealth);
router.post('/system/email-health/reset-breaker', emailHealth.resetBreaker);
router.put('/system/email-health/warmup', emailHealth.setWarmupStage);
router.post('/system/email-health/batches/:batchId/resume', emailHealth.resumeBatch);
router.get('/system/email-health/suppression', emailHealth.listSuppression);
router.delete('/system/email-health/suppression/:email', emailHealth.removeSuppression);

module.exports = router;
