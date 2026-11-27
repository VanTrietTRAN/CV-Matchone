const CvProfile = require("../models/CvProfile");
const storageService = require("../services/storageService");
const Job = require("../models/Job");
const Application = require("../models/Application");
const aiService = require("../services/aiService");
const { buildCvEmbeddingText, isEmbeddable } = require('../utils/cvEmbeddingText');
const { isSafeImage } = require('../utils/safeUrl');

/**
 * Multer giải mã tên file theo latin1, nên "Nguyễn Văn An.pdf" thành mojibake
 * "Nguyá»…n...". Đổi lại sang UTF-8 khi chuỗi đúng là UTF-8 bị đọc nhầm.
 */
const decodeOriginalName = (name) => {
  if (!name) return '';
  try {
    const utf8 = Buffer.from(name, 'latin1').toString('utf8');
    return utf8.includes('\uFFFD') ? name : utf8;
  } catch {
    return name;
  }
};

/** Content-Disposition giữ được tên tiếng Việt (RFC 5987) và có bản ASCII dự phòng. */
const contentDisposition = (baseName) => {
  const name = `${String(baseName || 'cv').trim() || 'cv'}.pdf`;
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^\w.-]+/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/** File CV gốc phải thuộc chính chủ hồ sơ: key luôn có dạng cvs/<userId>-<thời điểm>.pdf */
const ownsFileKey = (profile) =>
  typeof profile.fileUrl === 'string' && profile.fileUrl.startsWith(`cvs/${profile.userId}-`);

const uploadCv = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn một file PDF." });
    }
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ message: "File tải lên rỗng, vui lòng chọn lại." });
    }
    // MIME do trình duyệt tự khai — kiểm tra chữ ký file thật (%PDF-)
    if (req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ message: "File không phải PDF hợp lệ." });
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
    const original = decodeOriginalName(req.file.originalname).replace(/\.pdf$/i, "");
    const tempName =
      (typeof req.body.fullName === "string" && req.body.fullName.trim()) || original || "CV Profile";
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
    // Chi tiết cấu hình kho lưu trữ chỉ ghi log — trước đây trả ra client cả
    // danh sách biến R2 còn thiếu. Admin xem ở trang Hệ thống.
    console.error("[Upload CV] Thất bại:", error, storageService.getStorageConfig());
    res.status(500).json({ message: "Không tải được CV lên. Vui lòng thử lại sau." });
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
    if (!isSafeImage(req.body.photo)) {
      return res.status(400).json({ message: "Ảnh chân dung phải là ảnh JPEG, PNG hoặc WebP." });
    }
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

    if (!isSafeImage(req.body.photo)) {
      return res.status(400).json({ message: "Ảnh chân dung phải là ảnh JPEG, PNG hoặc WebP." });
    }

    // KHÔNG có fileUrl: trước đây client gửi fileUrl = key file CV của người
    // khác là tải được (và xoá được) file đó. fileUrl chỉ do uploadCv gán.
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

    // Xóa file gốc — CHỈ khi file thuộc chính chủ hồ sơ và không hồ sơ nào khác
    // còn trỏ tới nó (chặn xoá nhầm file của người khác).
    const fileShared =
      profile.fileUrl &&
      (await CvProfile.exists({ _id: { $ne: profile._id }, fileUrl: profile.fileUrl }));
    if (profile.fileUrl && ownsFileKey(profile) && !fileShared) {
      try {
        console.log(`Deleting CV file on Cloudflare R2: ${profile.fileUrl}`);
        await storageService.deleteFile(profile.fileUrl);
      } catch (err) {
        console.error("Error deleting file on R2:", err.message);
      }
    }

    const wasPrimary = profile.isPrimary;
    await profile.deleteOne();

    // Xoá CV chính thì nâng CV mới nhất CÒN LẠI CỦA CHÍNH CHỦ hồ sơ — bản cũ
    // dùng req.user._id, nên admin xoá CV của ứng viên lại nâng CV của admin.
    if (wasPrimary) {
      const next = await CvProfile.findOne({ userId: profile.userId }).sort({ createdAt: -1 });
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
      return res.status(400).json({ message: "Hồ sơ này không có file PDF đính kèm." });
    }
    // Hồ sơ cũ có thể đã bị gán fileUrl của người khác trước khi vá lỗi
    if (!ownsFileKey(profile)) {
      return res.status(403).json({ message: "Không có quyền tải file CV này." });
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
      // Nhà tuyển dụng chỉ tải được ĐÚNG CV đã được nộp vào tin của mình —
      // không phải mọi CV của ứng viên đó (CV nháp, CV nộp chỗ khác).
      const employerJobs = await Job.find({ employerId: req.user._id }).select("_id");
      const jobIds = employerJobs.map(job => job._id);

      const hasApplication = await Application.exists({
        candidateId: profile.userId,
        cvProfileId: profile._id,
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
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", contentDisposition(profile.fullName));
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
    res.status(500).json({ message: "Không tạo được link tải CV." });
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

    // Một lệnh bulkWrite có thứ tự: bấm "đặt làm CV chính" liên tục ở hai CV
    // không còn để lại hai CV chính hoặc không CV nào.
    await CvProfile.bulkWrite(
      [
        { updateMany: { filter: { userId: profile.userId, _id: { $ne: profile._id } }, update: { $set: { isPrimary: false } } } },
        { updateOne: { filter: { _id: profile._id }, update: { $set: { isPrimary: true } } } },
      ],
      { ordered: true },
    );
    profile.isPrimary = true;

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

