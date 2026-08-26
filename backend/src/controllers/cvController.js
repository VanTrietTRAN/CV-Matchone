const CvProfile = require("../models/CvProfile");
const storageService = require("../services/storageService");
const Job = require("../models/Job");
const Application = require("../models/Application");
const aiService = require("../services/aiService");
const { buildCvEmbeddingText, isEmbeddable } = require('../utils/cvEmbeddingText');

const uploadCv = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn một file PDF." });
    }
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ message: "File tải lên rỗng, vui lòng chọn lại." });
    }

    const { driver } = storageService.getStorageConfig();
    console.log(`[Upload CV] Bắt đầu — nơi lưu trữ: ${driver}`);

    const uniqueFilename = `cvs/${req.user._id}-${Date.now()}.pdf`;
    const fileKey = await storageService.uploadFile(
      req.file.buffer,
      uniqueFilename,
      req.file.mimetype,
      { userId: req.user._id }
    );
    console.log(`[Upload CV] Đã lưu file. Key: ${fileKey}`);

    const existingPrimary = await CvProfile.findOne({ userId: req.user._id, isPrimary: true });
    
    // Create the CV profile in 'queued' state. The background cron worker will pick it up
    // and populate the parsed AI fields and embedding vectors.
    const tempName = req.body.fullName || req.file.originalname || "CV Profile";
    const newCv = await CvProfile.create({
      userId: req.user._id,
      fullName: tempName,
      headline: "Processing profile details...",
      fileUrl: fileKey,
      isLookingForJob: true,
      isPrimary: !existingPrimary,
      processingStatus: "queued",
      processingError: null,
      attempts: 0
    });

    res.status(201).json({
      message: "Đã tải CV lên. Hệ thống đang bóc tách nội dung bằng AI ở nền.",
      data: newCv
    });
  } catch (error) {
    // Bản cũ trả câu chung chung "System error preparing profile upload" cho mọi
    // lỗi, kể cả khi nguyên nhân là thiếu cấu hình kho lưu trữ. Nói thẳng ra để
    // người vận hành biết cần sửa gì.
    console.error("[Upload CV] Thất bại:", error);
    res.status(500).json({
      message: `Không tải được CV lên: ${error.message}`,
      storage: storageService.getStorageConfig(),
    });
  }
};


const getMyCvProfiles = async (req, res) => {
  try {
    const profiles = await CvProfile.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });
    res.json({ data: profiles });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCvProfileById = async (req, res) => {
  try {
    const profile = await CvProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Không tìm thấy hồ sơ" });
    }

    if (
      req.user.role !== "admin" &&
      profile.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Không có quyền truy cập hồ sơ này" });
    }

    res.json({ data: profile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createCvProfile = async (req, res) => {
  try {
    const existingPrimary = await CvProfile.findOne({ userId: req.user._id, isPrimary: true });
    const payload = {
      userId: req.user._id,
      fullName: req.body.fullName || "Chưa cập nhật",
      headline: req.body.headline,
      email: req.body.email,
      phone: req.body.phone,
      location: req.body.location,
      address: req.body.address,
      dateOfBirth: req.body.dateOfBirth,
      website: req.body.website,
      photo: req.body.photo,
      summary: req.body.summary,
      skills: req.body.skills || [],
      certifications: req.body.certifications,
      experience: req.body.experience || [],
      education: req.body.education || [],
      languages: req.body.languages || [],
      isLookingForJob:
        typeof req.body.isLookingForJob === "boolean"
          ? req.body.isLookingForJob
          : true,
      isPrimary: !existingPrimary,
    };

    const createdProfile = await CvProfile.create(payload);

    const textForEmb = buildCvEmbeddingText(payload);

    if (isEmbeddable(textForEmb)) {
      try {
        const embedding = await aiService.getEmbedding(textForEmb.substring(0, 3000));
        if (embedding && embedding.length > 0) {
          createdProfile.embedding = embedding;
          await createdProfile.save();
          console.log('CV Profile: embedding tao thanh cong,', embedding.length, 'chieu');
        }
      } catch (e) {
        console.error('[CV] Tao embedding that bai:', e.message);
      }
    } else {
      createdProfile.embedding = [];
      await createdProfile.save();
    }

    res.status(201).json({ message: "Tạo hồ sơ thành công", data: createdProfile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCvProfile = async (req, res) => {
  try {
    const profile = await CvProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Không tìm thấy hồ sơ" });
    }

    if (profile.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền cập nhật hồ sơ này" });
    }

    const allowedFields = [
      "fullName",
      "headline",
      "email",
      "phone",
      "location",
      "address",
      "dateOfBirth",
      "website",
      "photo",
      "summary",
      "skills",
      "certifications",
      "experience",
      "education",
      "languages",
      "isLookingForJob",
      "fileUrl",
    ];

    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        profile[field] = req.body[field];
      }
    });

    const updatedProfile = await profile.save();

    const changedFields = Object.keys(req.body);
    if (changedFields.some(f => ['summary','skills','experience','education', 'headline', 'certifications'].includes(f))) {
      const textForEmb = buildCvEmbeddingText(updatedProfile);

      if (isEmbeddable(textForEmb)) {
        try {
          const embedding = await aiService.getEmbedding(textForEmb.substring(0, 3000));
          if (embedding && embedding.length > 0) {
            updatedProfile.embedding = embedding;
            await updatedProfile.save();
            console.log('CV Profile: cap nhat embedding thanh cong,', embedding.length, 'chieu');
          }
        } catch (e) {
          console.error('[CV] Cap nhat embedding that bai:', e.message);
        }
      } else {
        updatedProfile.embedding = [];
        await updatedProfile.save();
        console.log('CV Profile: thong tin qua ngan, da xoa embedding.');
      }
    }

    res.json({ message: "Cập nhật hồ sơ thành công", data: updatedProfile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCvProfile = async (req, res) => {
  try {
    const profile = await CvProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (
      req.user.role !== "admin" &&
      profile.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "You are not authorized to delete this profile" });
    }

    // Xóa file vật lý trên Cloudflare R2 trước khi xóa trong DB
    if (profile.fileUrl) {
      try {
        console.log(`Deleting CV file on Cloudflare R2: ${profile.fileUrl}`);
        await storageService.deleteFile(profile.fileUrl);
      } catch (err) {
        console.error("Error deleting file on R2:", err.message);
      }
    }

    const wasPrimary = profile.isPrimary;
    await profile.deleteOne();

    // Deleting the primary CV promotes the newest remaining one
    if (wasPrimary) {
      const next = await CvProfile.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
      if (next) {
        next.isPrimary = true;
        await next.save();
      }
    }

    res.json({ message: "Profile deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const downloadCv = async (req, res) => {
  try {
    const profile = await CvProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "CV profile not found" });
    }

    if (!profile.fileUrl) {
      return res.status(400).json({ message: "This profile does not have a PDF file attached" });
    }

    const userIdStr = req.user._id.toString();
    const candidateIdStr = profile.userId.toString();

    // ─── ACCESS AUTHORIZATION (PREVENT IDOR) ──────────────────────────────────
    let isAuthorized = false;

    if (req.user.role === "admin") {
      isAuthorized = true;
    } else if (req.user.role === "candidate") {
      // Candidates can only download their own CVs
      isAuthorized = userIdStr === candidateIdStr;
    } else if (req.user.role === "employer") {
      // Employers can only download CVs if the candidate applied to one of their jobs
      // 1. Get jobs posted by this employer
      const employerJobs = await Job.find({ employerId: req.user._id }).select("_id");
      const jobIds = employerJobs.map(job => job._id);

      // 2. Check if an application exists for this candidate matching those jobs
      const hasApplication = await Application.exists({
        candidateId: profile.userId,
        jobId: { $in: jobIds }
      });

      isAuthorized = !!hasApplication;
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: "You are not authorized to access or download this CV file!" });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Link ký sẵn chỉ có ở chế độ R2. Khi file nằm trong MongoDB thì không có
    // link nào để chuyển hướng tới — phải tự stream file ra.
    const signedUrl = await storageService.getSignedDownloadUrl(profile.fileUrl);

    if (!signedUrl) {
      const buffer = await storageService.getFileBuffer(profile.fileUrl);
      if (!buffer) {
        return res.status(404).json({ message: "Không tìm thấy file CV trong kho lưu trữ." });
      }
      const safeName = `${(profile.fullName || "cv").replace(/[^\w.-]+/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      return res.send(buffer);
    }

    // Trả JSON khi client hỏi bằng fetch; chuyển hướng thẳng sang R2 khi người
    // dùng bấm vào link.
    if (req.query.json === "true" || req.headers.accept?.includes("application/json")) {
      res.json({
        message: "CV download link generated successfully",
        downloadUrl: signedUrl,
        expiresInSeconds: 300
      });
    } else {
      res.redirect(302, signedUrl);
    }
  } catch (error) {
    console.error("Lỗi khi tạo link tải CV:", error);
    res.status(500).json({ message: `Không tạo được link tải CV: ${error.message}` });
  }
};

const setPrimaryCV = async (req, res) => {
  try {
    const profile = await CvProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (profile.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to change this profile" });
    }

    await CvProfile.updateMany(
      { userId: req.user._id, _id: { $ne: profile._id } },
      { $set: { isPrimary: false } }
    );

    profile.isPrimary = true;
    await profile.save();

    res.json({ message: "Set as primary CV successfully", data: profile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const retryCvAiCandidate = async (req, res) => {
  try {
    const cv = await CvProfile.findById(req.params.id);
    if (!cv) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ CV.' });
    }
    if (cv.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Bạn không có quyền thao tác trên CV này.' });
    }
    if (cv.processingStatus !== 'failed') {
      return res.status(400).json({ message: 'Chỉ có thể thử lại đối với các CV bị lỗi bóc tách.' });
    }
    if (!cv.fileUrl) {
      return res.status(400).json({ message: 'Hồ sơ CV không có file PDF đính kèm để bóc tách lại.' });
    }

    cv.processingStatus = 'queued';
    cv.processingError = null;
    cv.attempts = 0;
    cv.lastAiAttemptAt = new Date();
    await cv.save();

    res.json({ message: 'Đã đưa CV vào hàng chờ bóc tách lại AI thành công!', data: cv });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  uploadCv,
  getMyCvProfiles,
  getCvProfileById,
  createCvProfile,
  updateCvProfile,
  deleteCvProfile,
  setPrimaryCV,
  downloadCv,
  retryCvAiCandidate,
};

