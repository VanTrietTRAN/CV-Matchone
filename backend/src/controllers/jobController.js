const crypto = require("crypto");
const Job = require("../models/Job");
const JobView = require("../models/JobView");
const Application = require("../models/Application");
const CvProfile = require("../models/CvProfile");
const aiService = require("../services/aiService");
const { normalizeText } = require("../utils/normalizeText");
const { parseMoney, normalizeCurrency, formatSalary } = require("../utils/salary");

/**
 * Chuẩn hoá bộ lương trước khi lưu. Số tiền gửi lên dạng chuỗi ("178.000") được
 * đọc theo lối Việt Nam thay vì kiểu Mỹ, và chuỗi `salary` luôn dựng lại từ số
 * để thẻ tin, trang chi tiết và email hiện cùng một mức lương.
 */
const roundMoney = (v) => (typeof v === "number" ? Math.round(v) : v);

const syncSalaryFields = (target) => {
  target.salaryMin = roundMoney(parseMoney(target.salaryMin));
  target.salaryMax = roundMoney(parseMoney(target.salaryMax));
  target.currency = normalizeCurrency(target.currency) || "VND";
  if ((target.salaryMin || 0) > 0 || (target.salaryMax || 0) > 0) {
    target.salary = formatSalary(target.salaryMin, target.salaryMax, target.currency);
  }
};

const computeJobEmbedding = async (title, description, requirements) => {
  const reqArr = Array.isArray(requirements) ? requirements : [];
  // Chuẩn hoá trước khi tính vector: chữ "font hoa mỹ" mô hình đọc ra vô nghĩa
  const text = normalizeText([title, description, ...reqArr].filter(Boolean).join("\n")).substring(
    0,
    3000,
  );
  if (!text.trim()) {
    return [];
  }
  try {
    const emb = await aiService.getEmbedding(text);
    return emb && emb.length ? emb : [];
  } catch (e) {
    console.error("computeJobEmbedding:", e.message);
    return [];
  }
};

const matchJobWithAllCandidates = async (job) => {
  if (!job.embedding || job.embedding.length === 0) return;
  try {
    const User = require("../models/User");
    const CvProfileModel = require("../models/CvProfile");
    const Notification = require("../models/Notification");
    const CompanyProfileModel = require("../models/CompanyProfile");

    const companyProf = await CompanyProfileModel.findOne({ userId: job.employerId });
    const companyName = companyProf?.companyName || "Đối tác của CVMatchOne";

    const candidates = await User.find({
      role: "candidate",
      isEmailSubscribed: true,
    });

    for (const candidate of candidates) {
      const ApplicationModel = require("../models/Application");
      const hasApplied = await ApplicationModel.findOne({
        candidateId: candidate._id,
        jobId: job._id
      });
      if (hasApplied) continue;

      const cv = await CvProfileModel.findOne({ userId: candidate._id }).sort({ createdAt: -1 });
      if (!cv || !cv.isLookingForJob || !cv.embedding || cv.embedding.length === 0) continue;

      const minMatchScore = candidate.minMatchScore || 70;
      const rawScore = await aiService.calculateMatchingScore(cv.embedding, job.embedding);
      const percent = Math.round(Math.min(1, Math.max(0, rawScore)) * 100);

      if (percent >= minMatchScore) {
        const candidateNotifExists = await Notification.findOne({
          userId: candidate._id,
          type: 'job_match',
          jobId: job._id
        });
        if (!candidateNotifExists) {
          await Notification.create({
            userId: candidate._id,
            type: 'job_match',
            title: `Cơ hội việc làm mới phù hợp: ${job.title}`,
            body: `Hệ thống AI phát hiện bạn phù hợp ${percent}% với vị trí này tại ${companyName} (dựa trên CV: ${cv.fullName}).`,
            matchingScore: percent,
            jobId: job._id,
            cvProfileId: cv._id
          });
          console.log(`[Notification - Instant] Created candidate matching notification: ${candidate.email} - job: ${job.title}`);
        }

        const employerNotifExists = await Notification.findOne({
          userId: job.employerId,
          type: 'job_match',
          jobId: job._id,
          candidateId: candidate._id
        });
        if (!employerNotifExists) {
          await Notification.create({
            userId: job.employerId,
            type: 'job_match',
            title: `Ứng viên tiềm năng mới cho: ${job.title}`,
            body: `Hệ thống AI phát hiện ứng viên ${cv.fullName} phù hợp ${percent}% với yêu cầu tuyển dụng.`,
            matchingScore: percent,
            jobId: job._id,
            candidateId: candidate._id,
            cvProfileId: cv._id
          });
          console.log(`[Notification - Instant] Created employer matching notification: ${job.employerId} - candidate: ${candidate.email}`);
        }
      }
    }
  } catch (err) {
    console.error("Lỗi khi khớp nhanh sau khi tạo job:", err.message);
  }
};

/**
 * Dựng điều kiện lọc dùng chung cho mọi nơi liệt kê tin tuyển dụng
 * (ứng viên tìm việc, nhà tuyển dụng xem tin của mình, admin quản lý).
 *
 * Cùng một bộ từ khóa cho cả 3 tác nhân: `industry` và `specialization` là slug
 * trong frontend/lib/job-categories.ts, `q` tìm trong tiêu đề / mô tả / yêu cầu.
 */
const escapeRegex = (v) => String(v).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildJobFilter = (query = {}) => {
  const filter = {};

  if (query.industry) filter.industry = query.industry;
  if (query.specialization) filter.specialization = query.specialization;
  if (query.location) filter.location = query.location;
  if (query.workType) filter.jobType = query.workType;

  const q = escapeRegex(query.q || query.search || '');
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { requirements: { $elemMatch: { $regex: q, $options: 'i' } } },
    ];
  }

  return filter;
};

/**
 * Gắn cờ `isPro` cho từng tin dựa trên tài khoản nhà tuyển dụng đã populate.
 * Cờ nằm ở User nên không sort thẳng trong MongoDB được — đổi lại chỉ tốn đúng
 * một truy vấn như cũ, không phải hỏi thêm bảng nào.
 */
const withProFlag = (jobs) =>
  jobs.map((job) => {
    const obj = typeof job.toObject === "function" ? job.toObject() : job;
    return { ...obj, isPro: Boolean(obj.employerId && obj.employerId.isPro) };
  });

/**
 * Tin của doanh nghiệp PRO luôn đứng trước — đây là quyền lợi của gói PRO.
 * Trong cùng một nhóm thì giữ nguyên tiêu chí sắp xếp thường ngày (`tiebreak`),
 * nên bật PRO không làm đảo lộn thứ tự còn lại của danh sách.
 */
const sortProFirst = (jobs, tiebreak) =>
  jobs.sort((a, b) => (a.isPro === b.isPro ? tiebreak(a, b) : b.isPro ? 1 : -1));

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

const getAllOpenJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ status: "open", isDeleted: { $ne: true }, ...buildJobFilter(req.query) })
      .populate("employerId", "email role isPro")
      .select("-embedding")
      .sort({ createdAt: -1 });

    res.json({ data: sortProFirst(withProFlag(jobs), byNewest) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({
      employerId: req.user._id,
      ...buildJobFilter(req.query),
    })
      .select("-embedding")
      .sort({ createdAt: -1 });

    // Đếm hồ sơ một lần cho cả danh sách thay vì mỗi tin một truy vấn.
    // Lượt xem đã nằm sẵn trên chính tin nên không phải đếm lại.
    const counts = await Application.aggregate([
      { $match: { jobId: { $in: jobs.map((j) => j._id) } } },
      { $group: { _id: "$jobId", count: { $sum: 1 } } },
    ]);
    const applyCountOf = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
      data: jobs.map((j) => ({
        ...j.toObject(),
        applyCount: applyCountOf.get(String(j._id)) || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getJobById = async (req, res) => {
  try {
    const CompanyProfile = require('../models/CompanyProfile');
    const job = await Job.findById(req.params.id)
      .populate("employerId", "email role isPro")
      .select("-embedding");
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy tin tuyển dụng" });
    }

    const companyProfile = await CompanyProfile.findOne({ userId: job.employerId._id || job.employerId });

    const otherJobs = await Job.find({
      employerId: job.employerId._id || job.employerId,
      status: 'open',
      _id: { $ne: job._id }
    }).select('title location salary expiresAt createdAt').limit(5);

    res.json({ data: withProFlag([job])[0], companyProfile: companyProfile || null, otherJobs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createJob = async (req, res) => {
  try {
    const payload = {
      employerId: req.user._id,
      title: req.body.title,
      description: req.body.description,
      requirements: req.body.requirements || [],
      location: req.body.location,
      salary: req.body.salary || '',
      jobType: req.body.jobType || '',
      experience: req.body.experience || '',
      level: req.body.level || '',
      industry: req.body.industry || '',
      specialization: req.body.specialization || '',
      education: req.body.education || '',
      salaryMin: req.body.salaryMin ?? null,
      salaryMax: req.body.salaryMax ?? null,
      currency: req.body.currency || 'VND',
      benefits: req.body.benefits || [],
      expiresAt: req.body.expiresAt,
      isEmailEnabled:
        typeof req.body.isEmailEnabled === "boolean"
          ? req.body.isEmailEnabled
          : true,
      status: req.body.status || "open",
    };
    syncSalaryFields(payload);

    const embedding = await computeJobEmbedding(
      payload.title,
      payload.description,
      payload.requirements,
    );

    const createdJob = await Job.create({ ...payload, embedding });

    matchJobWithAllCandidates(createdJob).catch(err =>
      console.error("Lỗi khi chạy matchJobWithAllCandidates:", err.message)
    );

    res.status(201).json({ message: "Tạo tin tuyển dụng thành công", data: createdJob });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createJobFromOld = async (req, res) => {
  try {
    const oldJob = await Job.findById(req.params.id);
    if (!oldJob) {
      return res.status(404).json({ message: "Không tìm thấy tin gốc để sao chép" });
    }

    if (oldJob.employerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền sao chép tin tuyển dụng này" });
    }

    const copy = {
      employerId: req.user._id,
      title: req.body.title || oldJob.title,
      description: req.body.description || oldJob.description,
      requirements: req.body.requirements || oldJob.requirements,
      location: req.body.location || oldJob.location,
      // Nhân bản phải giữ nguyên phân loại và đãi ngộ của tin gốc,
      // nếu không tin mới sẽ rỗng ngành nghề và biến mất khỏi thống kê.
      salary: req.body.salary || oldJob.salary,
      jobType: req.body.jobType || oldJob.jobType,
      experience: req.body.experience || oldJob.experience,
      level: req.body.level || oldJob.level,
      industry: req.body.industry || oldJob.industry,
      specialization: req.body.specialization || oldJob.specialization,
      education: req.body.education || oldJob.education,
      salaryMin: req.body.salaryMin ?? oldJob.salaryMin,
      salaryMax: req.body.salaryMax ?? oldJob.salaryMax,
      currency: req.body.currency || oldJob.currency,
      benefits: req.body.benefits || oldJob.benefits,
      expiresAt: req.body.expiresAt || oldJob.expiresAt,
      isEmailEnabled:
        typeof req.body.isEmailEnabled === "boolean"
          ? req.body.isEmailEnabled
          : oldJob.isEmailEnabled,
      status: req.body.status || "open",
      embedding: oldJob.embedding || [],
    };
    syncSalaryFields(copy);
    const copiedJob = await Job.create(copy);

    res.status(201).json({ message: "Tạo tin mới từ tin cũ thành công", data: copiedJob });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy tin tuyển dụng" });
    }

    if (job.employerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền cập nhật tin tuyển dụng này" });
    }

    // Nhà tuyển dụng sửa được mọi trường họ nhập lúc đăng tin.
    // Không cho sửa: employerId, embedding, isDeleted, createdAt.
    const allowedFields = [
      "title",
      "description",
      "requirements",
      "location",
      "expiresAt",
      "isEmailEnabled",
      "status",
      "industry",
      "specialization",
      "jobType",
      "experience",
      "level",
      "education",
      "salary",
      "salaryMin",
      "salaryMax",
      "currency",
      "benefits",
    ];

    let shouldReembed = false;
    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        if (field === "title" || field === "description" || field === "requirements") {
          shouldReembed = true;
        }
        job[field] = req.body[field];
      }
    });
    if (["salary", "salaryMin", "salaryMax", "currency"].some((f) => req.body[f] !== undefined)) {
      syncSalaryFields(job);
    }

    if (shouldReembed) {
      const fresh = await computeJobEmbedding(job.title, job.description, job.requirements);
      // computeJobEmbedding trả [] khi AI service lỗi hoặc Gemini 429. Gán thẳng sẽ
      // xoá mất vector cũ → tin rơi về 0% phù hợp với mọi ứng viên mà không báo gì.
      // Chỉ ghi đè khi tính lại thành công; thất bại thì giữ vector cũ.
      if (fresh && fresh.length) {
        job.embedding = fresh;
      } else if (job.embedding?.length) {
        console.warn(
          `[updateJob] Không tính lại được embedding cho job ${job._id}, giữ vector cũ.`,
        );
      }
    }

    const updatedJob = await job.save();
    res.json({ message: "Cập nhật tin tuyển dụng thành công", data: updatedJob });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy tin tuyển dụng" });
    }

    // Route cho phép cả admin, nhưng chỗ này trước đây chỉ so chủ sở hữu nên
    // admin gọi vào luôn bị 403 — cấp quyền ở một nơi mà chặn ở nơi khác.
    const isOwner = job.employerId.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Không có quyền xóa tin tuyển dụng này" });
    }

    // Xoá tin mà để lại đơn ứng tuyển và thông báo trỏ tới nó thì ứng viên sẽ
    // thấy đơn không mở được, còn trang quản lý đếm sai số liệu.
    const Notification = require("../models/Notification");
    const [apps, notifs] = await Promise.all([
      Application.deleteMany({ jobId: job._id }),
      Notification.deleteMany({ jobId: job._id }),
      // Xoá cứng tin thì lịch sử lượt xem cũng không còn chỗ bám vào
      JobView.deleteMany({ jobId: job._id }),
    ]);

    await job.deleteOne();
    res.json({
      message: "Đã xoá tin tuyển dụng",
      data: {
        deletedApplications: apps.deletedCount,
        deletedNotifications: notifs.deletedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const closeJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy tin tuyển dụng" });
    }

    if (job.employerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền khóa tin tuyển dụng này" });
    }

    job.status = "closed";
    await job.save();

    res.json({ message: "Đã khóa tin tuyển dụng", data: job });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getJobsWithMatchPreview = async (req, res) => {
  try {
    const jobs = await Job.find({ status: "open", isDeleted: { $ne: true }, ...buildJobFilter(req.query) })
      .populate("employerId", "email role isPro")
      .sort({ createdAt: -1 });

    let cvProfile = await CvProfile.findOne({ userId: req.user._id, isPrimary: true });
    if (!cvProfile) {
      cvProfile = await CvProfile.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
    }
    const cvEmbedding = cvProfile?.embedding || [];
    const hasEmbedding = cvEmbedding.length > 0;

    const jobsWithScore = await Promise.all(
      // `embedding` chỉ dùng để chấm điểm ở đây; tách ra khỏi phần trả về vì
      // mỗi vector là 768 số — gửi kèm cả danh sách thì response phình vô ích.
      withProFlag(jobs).map(async ({ embedding, ...job }) => {
        let previewScore = null;
        if (hasEmbedding && embedding && embedding.length > 0) {
          try {
            const raw = await aiService.calculateMatchingScore(cvEmbedding, embedding);
            previewScore = Math.round(Math.min(1, Math.max(0, raw)) * 100);
          } catch {
            previewScore = null;
          }
        }
        return { ...job, previewScore };
      })
    );


    sortProFirst(jobsWithScore, (a, b) => {
      if (a.previewScore === null && b.previewScore === null) return 0;
      if (a.previewScore === null) return 1;
      if (b.previewScore === null) return -1;
      return b.previewScore - a.previewScore;
    });

    res.json({
      data: jobsWithScore,
      hasEmbedding,
      cvName: cvProfile ? cvProfile.fullName : null,
      cvId: cvProfile ? cvProfile._id : null,
      isPrimary: cvProfile ? cvProfile.isPrimary : false
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cùng một người mở lại tin trong khoảng này chỉ tính 1 lượt — nếu không, giữ
// F5 vài giây là số liệu của nhà tuyển dụng thành vô nghĩa.
const VIEW_DEDUPE_MS = 30 * 60 * 1000;

/**
 * Danh tính người xem: id tài khoản khi đã đăng nhập, còn khách vãng lai thì
 * băm IP + User-Agent. Băm để không lưu IP thô của khách vào database, vẫn đủ
 * để nhận ra cùng một người giữa hai lần mở trang.
 */
const visitorKeyOf = (req) => {
  if (req.user) return `u:${req.user._id}`;
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  const hash = crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex");
  return `g:${hash.slice(0, 32)}`;
};

/**
 * POST /api/jobs/:id/view — ghi nhận một lượt xem tin tuyển dụng.
 * Mở cho cả khách vãng lai; `optionalAuth` cho biết người xem là ai nếu có token.
 */
const recordJobView = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select("employerId isDeleted");
    if (!job || job.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tin tuyển dụng" });
    }

    // Chủ tin và admin không được tính: nhà tuyển dụng mở tin của mình ra xem
    // vài lần là số liệu đã sai, mà đó lại chính là số liệu họ đang đọc.
    const isOwner = req.user && String(job.employerId) === String(req.user._id);
    if (isOwner || req.user?.role === "admin") {
      return res.json({ data: { counted: false, reason: "owner" } });
    }

    const isGuest = !req.user;
    const visitorKey = visitorKeyOf(req);
    const now = new Date();
    const seen = await JobView.findOne({ jobId: job._id, visitorKey });

    if (seen && now - seen.lastViewedAt < VIEW_DEDUPE_MS) {
      return res.json({ data: { counted: false, reason: "recent" } });
    }

    if (seen) {
      seen.views += 1;
      seen.lastViewedAt = now;
      await seen.save();
    } else {
      try {
        await JobView.create({
          jobId: job._id,
          userId: req.user?._id || null,
          visitorKey,
          isGuest,
          views: 1,
          firstViewedAt: now,
          lastViewedAt: now,
        });
      } catch (err) {
        // Hai tab mở cùng lúc cùng chạm vào chỉ mục duy nhất (jobId, visitorKey).
        // Lượt kia đã được tính rồi, lượt này bỏ qua.
        if (err.code === 11000) {
          return res.json({ data: { counted: false, reason: "duplicate" } });
        }
        throw err;
      }
    }

    const updated = await Job.findByIdAndUpdate(
      job._id,
      { $inc: { viewCount: 1, [isGuest ? "viewCountGuest" : "viewCountUser"]: 1 } },
      { new: true, select: "viewCount viewCountUser viewCountGuest" },
    );

    res.json({
      data: {
        counted: true,
        viewCount: updated.viewCount,
        viewCountUser: updated.viewCountUser,
        viewCountGuest: updated.viewCountGuest,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/jobs/:id/stats — số liệu một tin tuyển dụng cho chủ tin và admin:
 * bao nhiêu lượt xem (người dùng / vãng lai, tổng lượt và số người khác nhau)
 * và bao nhiêu hồ sơ ứng tuyển.
 */
const getJobStats = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select(
      "title employerId viewCount viewCountUser viewCountGuest",
    );
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy tin tuyển dụng" });
    }

    const isOwner = String(job.employerId) === String(req.user._id);
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Không có quyền xem số liệu tin tuyển dụng này" });
    }

    const [applications, uniqueViewers, uniqueUsers, byStatus] = await Promise.all([
      Application.countDocuments({ jobId: job._id }),
      JobView.countDocuments({ jobId: job._id }),
      JobView.countDocuments({ jobId: job._id, isGuest: false }),
      Application.aggregate([
        { $match: { jobId: job._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      data: {
        views: {
          total: job.viewCount || 0,
          user: job.viewCountUser || 0,
          guest: job.viewCountGuest || 0,
          uniqueTotal: uniqueViewers,
          uniqueUser: uniqueUsers,
          uniqueGuest: uniqueViewers - uniqueUsers,
        },
        applications: {
          total: applications,
          byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  computeJobEmbedding,
  recordJobView,
  getJobStats,
  getAllOpenJobs,
  getMyJobs,
  getJobById,
  createJob,
  createJobFromOld,
  updateJob,
  deleteJob,
  closeJob,
  getJobsWithMatchPreview,
};
