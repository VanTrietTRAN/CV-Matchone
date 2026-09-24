const express = require("express");
const router = express.Router();
const { protect, optionalAuth, authorize } = require("../middleware/authMiddleware");
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
router.post("/:id/view", optionalAuth, recordJobView);
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
