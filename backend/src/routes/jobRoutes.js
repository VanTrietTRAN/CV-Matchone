const express = require("express");
const router = express.Router();
const { validateObjectIdParam } = require('../middleware/validateObjectId');
router.param('id', validateObjectIdParam);
router.param('companyUserId', validateObjectIdParam);
const { protect, optionalAuth, authorize } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");

// Import đọc cả file Excel vào RAM và parse đồng bộ — không giới hạn thì bắn
// liên tục là DoS được server. 10 lần / 15 phút là đủ cho người dùng thật.
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn đã import quá nhiều lần. Vui lòng thử lại sau 15 phút." },
});

// Đếm lượt xem mở cho khách — chặn bắn liên tục từ một IP
const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Quá nhiều yêu cầu." },
});
const {
  getAllOpenJobs,
  getMyJobs,
  getJobById,
  createJob,
  createJobFromOld,
  updateJob,
  deleteJob,
  closeJob,
  getJobsWithMatchPreview,
  recordJobView,
  getJobStats,
} = require("../controllers/jobController");

router.get("/employer/my-jobs", protect, authorize("employer", "admin"), getMyJobs);
router.post("/", protect, authorize("employer", "admin"), createJob);
router.post(
  "/:id/clone",
  protect,
  authorize("employer", "admin"),
  createJobFromOld,
);
router.put("/:id", protect, authorize("employer", "admin"), updateJob);
router.patch("/:id/close", protect, authorize("employer", "admin"), closeJob);
// Đếm lượt xem: mở cho cả khách vãng lai, optionalAuth chỉ để biết người xem là ai.
router.post("/:id/view", viewLimiter, optionalAuth, recordJobView);
// Số liệu của một tin — chủ tin hoặc admin (kiểm tra chủ sở hữu nằm trong controller).
router.get("/:id/stats", protect, authorize("employer", "admin"), getJobStats);
// Import tin tuyển dụng từ Excel. Phải đặt TRƯỚC route "/:id" để "import"
// không bị hiểu là một id.
const sheetUpload = require("../middleware/sheetUploadMiddleware");
const { importJobs, downloadTemplate } = require("../controllers/importController");
router.get("/import/template", (req, res) => {
  req.params.kind = "jobs";
  downloadTemplate(req, res);
});
router.post(
  "/import",
  importLimiter,
  protect,
  authorize("employer", "admin"),
  sheetUpload.single("file"),
  importJobs,
);

router.delete("/:id", protect, authorize("employer", "admin"), deleteJob);
router.get("/", getAllOpenJobs);
router.get("/match-preview", protect, authorize("candidate"), getJobsWithMatchPreview);
router.get("/:id", getJobById);

module.exports = router;
