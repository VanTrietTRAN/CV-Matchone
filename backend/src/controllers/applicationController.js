const Application = require("../models/Application");
const Job = require("../models/Job");
const CvProfile = require("../models/CvProfile");
const aiService = require("../services/aiService");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { findPrimaryOrLatestCv } = require("../utils/primaryCv");
const { attachCompanyNames } = require("../utils/companyNames");

const STATUS_LABELS = {
  pending: "Đang chờ",
  reviewed: "Đã xem",
  interview: "Mời phỏng vấn",
  accepted: "Đã nhận",
  rejected: "Không phù hợp",
};

const applyToJob = async (req, res) => {
  try {
    const { jobId, cvProfileId } = req.body;
    if (!jobId || !mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Thiếu hoặc sai mã tin tuyển dụng." });
    }
    if (cvProfileId !== undefined && cvProfileId !== null && !mongoose.isValidObjectId(cvProfileId)) {
      return res.status(400).json({ message: "Mã CV không hợp lệ." });
    }

    const job = await Job.findById(jobId);
    const expired = job?.expiresAt && new Date(job.expiresAt) <= new Date();
    if (!job || job.isDeleted || job.status !== "open" || expired) {
      return res.status(404).json({ message: "Tin tuyển dụng không tồn tại hoặc đã đóng." });
    }

    let cvProfile;
    if (cvProfileId) {
      cvProfile = await CvProfile.findById(cvProfileId);
      if (!cvProfile || cvProfile.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Invalid CV profile" });
      }
    } else {
      // Ưu tiên CV chính (isPrimary) — trước đây lấy CV mới nhất, nộp nhầm CV
      cvProfile = await findPrimaryOrLatestCv(req.user._id);
      if (!cvProfile) {
        const email = req.user.email || "candidate";
        cvProfile = await CvProfile.create({
          userId: req.user._id,
          fullName: email.split("@")[0] || "Candidate",
          summary:
            "Profile automatically created upon application (demo). Please complete your CV details in Profile & CV to generate AI matching score.",
          skills: [],
          embedding: [],
          isLookingForJob: true,
        });
      }
    }

    const existing = await Application.findOne({
      jobId,
      candidateId: req.user._id,
    });
    if (existing) {
      return res.status(409).json({ message: "Bạn đã ứng tuyển tin này rồi." });
    }

    let matchingScore = 0;
    if (
      cvProfile.embedding &&
      cvProfile.embedding.length > 0 &&
      job.embedding &&
      job.embedding.length > 0
    ) {
      const raw = await aiService.calculateMatchingScore(cvProfile.embedding, job.embedding);
      matchingScore = Math.round(Math.min(1, Math.max(0, raw)) * 100);
    }

    let application;
    try {
      application = await Application.create({
        jobId,
        candidateId: req.user._id,
        cvProfileId: cvProfile._id,
        matchingScore,
        status: "pending",
      });
    } catch (e) {
      // Hai request nộp đơn cùng lúc: index unique chặn bản thứ hai
      if (e.code === 11000) {
        return res.status(409).json({ message: "Bạn đã ứng tuyển tin này rồi." });
      }
      throw e;
    }

    const populated = await Application.findById(application._id).populate({
      path: "jobId",
      select: "-embedding",
      populate: { path: "employerId", select: "role" },
    });

    try {
      const scoreText = matchingScore > 0 ? ` — Match score: ${matchingScore}%` : '';

      await Notification.updateMany(
        { userId: req.user._id, jobId: job._id, type: 'job_match' },
        { $set: { isDeleted: true } }
      );

      await Notification.create({
        userId: req.user._id,
        type: 'new_application',
        title: `Applied successfully: ${job.title}`,
        body: `Your job application has been submitted successfully (CV used: ${cvProfile.fullName})${scoreText}`,
        matchingScore: matchingScore || null,
        jobId: job._id,
        applicationId: application._id,
        cvProfileId: cvProfile._id
      });

      await Notification.create({
        userId: job.employerId,
        type: 'new_application',
        title: `New applicant for: ${job.title}`,
        body: `${cvProfile.fullName || req.user.email} has just applied for this position${scoreText}`,
        matchingScore: matchingScore || null,
        jobId: job._id,
        applicationId: application._id,
        candidateId: req.user._id,
        cvProfileId: cvProfile._id,
      });
    } catch (notifErr) {
      console.error('[Notification] Error creating notification:', notifErr.message);
    }

    res.status(201).json({ message: "Application submitted successfully", data: populated });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyApplications = async (req, res) => {
  try {
    const apps = await Application.find({ candidateId: req.user._id })
      .populate({
        path: "jobId",
        select: "-embedding",
        populate: { path: "employerId", select: "role isPro" },
      })
      .sort({ appliedAt: -1 });

    // If jobId is soft-deleted, populate returns null -> map fallback object to prevent UI crash
    const safeApps = apps.map((app) => {
      const obj = app.toObject();
      if (!obj.jobId) {
        obj.jobId = {
          _id: app.jobId,
          title: '[Job post removed or deleted]',
          location: 'N/A',
          status: 'closed',
          isDeleted: true,
        };
      }
      return obj;
    });
    // Tên công ty thay cho email đăng nhập của nhà tuyển dụng
    await attachCompanyNames(safeApps.map((a) => a.jobId).filter((j) => j && !j.isDeleted));

    res.json({ data: safeApps });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getApplicationsForJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: "Job post not found" });
    }

    if (
      job.employerId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "You are not authorized to view this list" });
    }

    const apps = await Application.find({ jobId: req.params.jobId })
      .populate("candidateId", "email role")
      .populate("cvProfileId", "-embedding")
      .sort({ matchingScore: -1 });

    const BASE_URL = `${req.protocol}://${req.get('host')}`;
    const appsWithPdfUrl = apps.map(app => {
      const obj = app.toObject();
      // Fallback if candidate account was soft-deleted
      if (!obj.candidateId) {
        obj.candidateId = { email: '[Account deleted]', role: 'candidate' };
      }
      // Fallback if CV profile was deleted
      if (!obj.cvProfileId) {
        obj.cvProfileId = { fullName: '[CV profile deleted]', skills: [] };
      } else if (obj.cvProfileId.fileUrl) {
        // Point to secure endpoint to prevent IDOR (only authorized employer with application can download)
        obj.cvProfileId.pdfUrl = `${BASE_URL}/api/cv/${obj.cvProfileId._id}/download`;
      }
      return obj;
    });

    res.json({ data: appsWithPdfUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['reviewed', 'interview', 'accepted', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
    }

    const app = await Application.findById(req.params.id).populate('jobId');
    if (!app) return res.status(404).json({ message: 'Application not found' });

    if (
      app.jobId.employerId.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'You are not authorized to update this application' });
    }

    const previous = app.status;
    app.status = status;
    await app.save();

    // Báo cho ứng viên — trước đây đổi trạng thái không tạo thông báo nào,
    // ứng viên chỉ biết khi tự mở lại danh sách đơn.
    if (previous !== status) {
      try {
        await Notification.create({
          userId: app.candidateId,
          type: 'application_status_update',
          title: `Cập nhật hồ sơ: ${app.jobId?.title || 'tin tuyển dụng'}`,
          body: `Trạng thái hồ sơ của bạn đã chuyển sang "${STATUS_LABELS[status] || status}".`,
          jobId: app.jobId?._id || app.jobId,
          applicationId: app._id,
          cvProfileId: app.cvProfileId,
        });
      } catch (notifErr) {
        console.error('[Notification] Không tạo được thông báo đổi trạng thái:', notifErr.message);
      }
    }

    const data = app.toObject();
    if (data.jobId && typeof data.jobId === 'object') delete data.jobId.embedding;
    res.json({ message: 'Status updated successfully', data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteApplication = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (
      app.candidateId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "You are not authorized to cancel this application" });
    }

    // Ứng viên chỉ rút được đơn CHƯA xử lý. Trước đây xoá được cả đơn đã bị từ
    // chối rồi nộp lại ngay như mới — lách quyết định của nhà tuyển dụng.
    if (req.user.role !== "admin" && app.status !== "pending") {
      return res.status(400).json({ message: "Chỉ rút được hồ sơ đang chờ xử lý." });
    }

    await Application.findByIdAndDelete(req.params.id);
    res.json({ message: "Application canceled successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  applyToJob,
  getMyApplications,
  getApplicationsForJob,
  updateApplicationStatus,
  deleteApplication,
};
