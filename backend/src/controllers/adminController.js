const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const CvProfile = require('../models/CvProfile');
const Notification = require('../models/Notification');
const SystemSetting = require('../models/SystemSetting');
const AuditLog = require('../models/AuditLog');
const { logAdminAction } = require('../services/auditLogService');
const { frontendOrigin } = require('../utils/frontendUrl');

const getStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalCandidates,
      totalEmployers,
      totalJobs,
      openJobs,
      closedJobs,
      totalApplications,
      totalCvs,
      totalNotifications,
      unreadNotifications,
      bannedUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'candidate' }),
      User.countDocuments({ role: 'employer' }),
      Job.countDocuments(),
      Job.countDocuments({ status: 'open' }),
      Job.countDocuments({ status: { $in: ['closed', 'archived'] } }),
      Application.countDocuments(),
      CvProfile.countDocuments(),
      Notification.countDocuments({ isDeleted: { $ne: true } }),
      Notification.countDocuments({ isRead: false, isDeleted: { $ne: true } }),
      User.countDocuments({ status: 'banned' }),
    ]);

    const recentUsers = await User.find()
      .select('email role status createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentApplications = await Application.find()
      .populate('candidateId', 'email')
      .populate('jobId', 'title')
      .sort({ appliedAt: -1 })
      .limit(5);

    res.json({
      data: {
        users: { total: totalUsers, candidates: totalCandidates, employers: totalEmployers, banned: bannedUsers },
        jobs: { total: totalJobs, open: openJobs, closed: closedJobs },
        applications: { total: totalApplications },
        cvs: { total: totalCvs },
        notifications: { total: totalNotifications, unread: unreadNotifications },
        recentUsers,
        recentApplications,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const role = req.query.role; // 'candidate' | 'employer' | 'admin'
    const status = req.query.status; // 'active' | 'banned'
    const search = req.query.search;

    const filter = { isDeleted: { $ne: true } };
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) filter.email = { $regex: search, $options: 'i' };

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ data: users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'banned'].includes(status)) {
      return res.status(400).json({ message: 'Status không hợp lệ. Chỉ chấp nhận: active, banned' });
    }
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Không thể thay đổi trạng thái tài khoản của chính mình' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

    // Log Audit Action
    await logAdminAction({
      req,
      action: status === 'banned' ? 'LOCK_USER' : 'UNLOCK_USER',
      targetModel: 'User',
      targetId: user._id,
      details: { email: user.email, role: user.role, newStatus: status },
    });

    res.json({ message: `Đã ${status === 'banned' ? 'khoá' : 'kích hoạt'} tài khoản thành công`, data: user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * PATCH /api/admin/users/:id/pro — cấp hoặc gỡ nhãn doanh nghiệp PRO.
 * Chỉ áp dụng cho tài khoản nhà tuyển dụng: PRO là quyền lợi hiển thị của tin
 * tuyển dụng, gắn cho ứng viên hay admin thì không có ý nghĩa gì.
 */
const updateUserPro = async (req, res) => {
  try {
    const { isPro } = req.body;
    if (typeof isPro !== 'boolean') {
      return res.status(400).json({ message: 'Thiếu trường isPro (true/false)' });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }
    if (user.role !== 'employer') {
      return res.status(400).json({ message: 'Chỉ tài khoản nhà tuyển dụng mới gắn được nhãn PRO' });
    }

    user.isPro = isPro;
    // Giữ mốc lần đầu được cấp; gỡ PRO thì xoá mốc để lần cấp sau tính lại từ đầu.
    user.proSince = isPro ? user.proSince || new Date() : undefined;
    await user.save();

    await logAdminAction({
      req,
      action: 'SET_EMPLOYER_PRO',
      targetModel: 'User',
      targetId: user._id,
      details: { email: user.email, isPro },
    });

    res.json({
      message: isPro ? `Đã nâng ${user.email} lên doanh nghiệp PRO` : `Đã gỡ nhãn PRO của ${user.email}`,
      data: { _id: user._id, isPro: user.isPro, proSince: user.proSince },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Không thể xóa tài khoản của chính mình' });
    }

    // Soft delete user to preserve relational application history
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, status: 'banned' },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

    // Log Audit Action
    await logAdminAction({
      req,
      action: 'DELETE_USER',
      targetModel: 'User',
      targetId: user._id,
      details: { email: user.email, role: user.role, softDeleted: true },
    });

    res.json({ message: 'Đã lưu trữ (xóa mềm) tài khoản thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetUserPasswordByAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản người dùng' });
    }

    // Đặt lại mật khẩu nay dùng mã 6 số như luồng "Quên mật khẩu" của người dùng.
    // Trước đây chỗ này vẫn dựng link có token — sau khi đổi luồng thì tham số
    // resetUrl không còn được đọc nữa nên email gửi đi thiếu hẳn phần hướng dẫn.
    const otp = require('../utils/otp');
    const { code, hash, expiresAt } = otp.issueCode();

    user.resetPasswordToken = hash;
    user.resetPasswordExpire = expiresAt;
    user.resetPasswordAttempts = 0;
    await user.save();

    const emailService = require('../services/emailService');
    await emailService.sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName || user.email,
      code,
      minutes: Math.round(otp.TTL_MS / 60000),
    });

    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'User',
      targetId: user._id,
      details: { email: user.email, actionType: 'PASSWORD_RESET_ASSIST' },
    });

    res.json({ message: `Đã gửi email hỗ trợ đặt lại mật khẩu tới ${user.email} thành công!` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const action = req.query.action;
    const search = req.query.search;

    const filter = {};
    if (action) filter.action = action;

    if (search) {
      const adminUsers = await User.find({ email: { $regex: search, $options: 'i' } }).select('_id');
      const adminIds = adminUsers.map((u) => u._id);
      filter.$or = [{ adminId: { $in: adminIds } }, { ipAddress: { $regex: search, $options: 'i' } }];
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .populate('adminId', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ data: logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * GET /api/admin/employers — danh sách nhà tuyển dụng cho ô chọn ở trang import
 * tin tuyển dụng của admin.
 *
 * /api/admin/users trả về User thuần, không có tên công ty (nằm ở CompanyProfile),
 * mà chọn doanh nghiệp theo email thì admin phải tự nhớ email nào là công ty nào.
 */
const getEmployerOptions = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const CompanyProfile = require('../models/CompanyProfile');

    const employers = await User.find({ role: 'employer', isDeleted: { $ne: true } })
      .select('email isPro status fullName importedAt mustChangePassword')
      .sort({ createdAt: -1 })
      .lean();

    const profiles = await CompanyProfile.find({
      userId: { $in: employers.map((e) => e._id) },
    })
      .select('userId companyName')
      .lean();
    const nameOf = new Map(profiles.map((p) => [String(p.userId), p.companyName]));

    let list = employers.map((e) => ({
      _id: e._id,
      email: e.email,
      companyName: nameOf.get(String(e._id)) || e.fullName || '',
      isPro: Boolean(e.isPro),
      status: e.status,
      // Tài khoản import chưa đăng nhập lần nào — admin nên biết để còn nhắc
      pendingFirstLogin: Boolean(e.importedAt && e.mustChangePassword === true),
    }));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) => e.email.toLowerCase().includes(q) || e.companyName.toLowerCase().includes(q),
      );
    }

    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getJobs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const search = req.query.search;

    const filter = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    // Cùng bộ từ khóa với trang tìm việc của ứng viên (slug trong job-categories.ts)
    if (req.query.industry) filter.industry = req.query.industry;
    if (req.query.specialization) filter.specialization = req.query.specialization;
    if (search) {
      const q = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (q) filter.title = { $regex: q, $options: 'i' };
    }

    const total = await Job.countDocuments(filter);
    const jobs = await Job.find(filter)
      .populate('employerId', 'email isPro')
      .select('-embedding')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Đếm hồ sơ cho cả trang bằng một truy vấn thay vì mỗi tin một lần.
    const counts = await Application.aggregate([
      { $match: { jobId: { $in: jobs.map((j) => j._id) } } },
      { $group: { _id: '$jobId', count: { $sum: 1 } } },
    ]);
    const applyCountOf = new Map(counts.map((c) => [String(c._id), c.count]));

    const jobsWithCount = jobs.map((job) => {
      const obj = job.toObject();
      return {
        ...obj,
        applyCount: applyCountOf.get(String(job._id)) || 0,
        isPro: Boolean(obj.employerId && obj.employerId.isPro),
      };
    });

    res.json({ data: jobsWithCount, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const closeJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: 'closed' },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Không tìm thấy tin tuyển dụng' });

    await logAdminAction({
      req,
      action: 'REJECT_JOB',
      targetModel: 'Job',
      targetId: job._id,
      details: { title: job.title, newStatus: 'closed' },
    });

    res.json({ message: 'Đã đóng tin tuyển dụng', data: job });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const deleteJob = async (req, res) => {
  try {
    // Soft delete / archive job to preserve application relational data
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, status: 'archived' },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Không tìm thấy tin tuyển dụng' });

    await logAdminAction({
      req,
      action: 'DELETE_JOB',
      targetModel: 'Job',
      targetId: job._id,
      details: { title: job.title, archived: true },
    });

    res.json({ message: 'Đã gỡ bài và lưu trữ (xóa mềm) tin tuyển dụng thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getSystemInfo = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const dbState = mongoose.connection.readyState;
    const dbStateMap = { 0: 'Ngắt kết nối', 1: 'Đã kết nối', 2: 'Đang kết nối', 3: 'Đang ngắt kết nối' };

    const aiServiceUrl = process.env.AI_SERVICE_URL || '(Chưa cấu hình)';
    const nodeEnv = process.env.NODE_ENV || 'development';

    const [totalNotifications, softDeletedNotifications, totalCvWithEmbedding, settingsRecord] = await Promise.all([
      Notification.countDocuments(),
      Notification.countDocuments({ isDeleted: true }),
      CvProfile.countDocuments({ embedding: { $exists: true, $not: { $size: 0 } } }),
      SystemSetting.findOne({ key: 'email_matching_settings' }),
    ]);

    let cronScheduleText = 'Tắt (Chưa lên lịch)';
    if (settingsRecord && settingsRecord.value.isEnabled) {
      const typeMap = {
        demo: 'Mỗi phút (Demo)',
        hourly: 'Mỗi giờ',
        daily: 'Hàng ngày (12h)',
        weekly: 'Hàng tuần (15h thứ Sáu)',
        custom: 'Tùy chỉnh',
      };
      const label = typeMap[settingsRecord.value.scheduleType] || 'Tùy chỉnh';
      cronScheduleText = `${settingsRecord.value.cronExpression} (${label})`;
    }

    res.json({
      data: {
        server: {
          uptime: `${hours}h ${minutes}m ${seconds}s`,
          uptimeSeconds,
          nodeEnv,
          nodeVersion: process.version,
          platform: process.platform,
          memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        database: {
          status: dbStateMap[dbState] || 'Không xác định',
          readyState: dbState,
          host: mongoose.connection.host || '—',
          name: mongoose.connection.name || '—',
        },
        services: {
          aiServiceUrl,
          cronSchedule: cronScheduleText,
        },
        // Cấu hình SMTP đã che khoá. Trước đây trang quản trị không hiển thị gì
        // về email, nên sai cấu hình chỉ lộ ra khi người dùng thắc mắc sao
        // không nhận được thư.
        email: require('../services/emailService').getEmailConfig(),
        storage: require('../services/storageService').getStorageConfig(),
        notifications: {
          total: totalNotifications,
          softDeleted: softDeletedNotifications,
        },
        cvs: {
          withEmbedding: totalCvWithEmbedding,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Bắt tay thật với máy chủ SMTP và báo lại kết quả.
 *
 * Khác với "Gửi email test": việc này không tốn quota gửi của Brevo, nên dùng
 * để dò cấu hình bao nhiêu lần cũng được.
 */
const checkEmailConnection = async (req, res) => {
  try {
    const emailService = require('../services/emailService');
    const result = await emailService.verifyEmailConnection();
    const config = emailService.getEmailConfig();

    return res.status(result.ok ? 200 : 502).json({
      message: result.ok
        ? `Kết nối SMTP thành công (${config.host}:${config.port}).`
        : `Kết nối SMTP thất bại: ${result.error}`,
      data: { ...config, ok: result.ok },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Mẫu nội dung email — admin sửa lời văn mà không cần deploy lại.
 *
 * Chỉ phần chữ nằm trong database; bố cục HTML vẫn ở trong code
 * (src/services/emailTemplates.js) để admin không làm vỡ giao diện thư.
 */
const getEmailTemplates = async (req, res) => {
  try {
    const tpl = require('../services/emailTemplates');
    const rec = await SystemSetting.findOne({ key: 'email_templates' });

    res.json({
      data: {
        templates: tpl.mergeTemplates(rec?.value),
        defaults: tpl.DEFAULTS,
        variables: tpl.VARIABLES,
        fieldLabels: tpl.FIELD_LABELS,
        templateLabels: tpl.TEMPLATE_LABELS,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateEmailTemplates = async (req, res) => {
  try {
    const tpl = require('../services/emailTemplates');
    const incoming = req.body?.templates;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ message: 'Thiếu dữ liệu mẫu email.' });
    }

    // Chỉ nhận đúng các nhóm/trường đã biết, bỏ qua mọi thứ lạ gửi kèm
    const clean = {};
    for (const group of Object.keys(tpl.DEFAULTS)) {
      const from = incoming[group];
      if (!from || typeof from !== 'object') continue;
      const picked = {};
      for (const field of Object.keys(tpl.DEFAULTS[group])) {
        if (typeof from[field] !== 'string') continue;
        const v = from[field].trim();
        // Chỉ lưu ô admin thực sự sửa. Lưu cả ô trùng mặc định thì lời văn bị
        // "đóng băng": lần sau sửa mặc định trong code, thư vẫn dùng bản cũ.
        if (v && v !== tpl.DEFAULTS[group][field]) picked[field] = v;
      }
      if (Object.keys(picked).length) clean[group] = picked;
    }

    await SystemSetting.findOneAndUpdate(
      { key: 'email_templates' },
      { $set: { key: 'email_templates', value: clean } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Bỏ cache để lần gửi kế tiếp dùng ngay nội dung mới
    require('../services/emailService').invalidateTemplateCache();

    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'SystemSetting',
      targetId: null,
      details: { setting: 'email_templates', groups: Object.keys(clean) },
    });

    res.json({
      message: 'Đã lưu nội dung email. Các thư gửi sau sẽ dùng nội dung mới.',
      data: { templates: tpl.mergeTemplates(clean) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Dựng bản xem trước bằng dữ liệu mẫu — không gửi thư, không đụng database. */
const previewEmailTemplate = async (req, res) => {
  try {
    const tpl = require('../services/emailTemplates');
    const { frontendOrigin } = require('../utils/frontendUrl');
    const key = req.params.key;

    if (!Object.keys(tpl.TEMPLATE_LABELS).includes(key)) {
      return res.status(400).json({ message: `Không có mẫu email tên "${key}".` });
    }

    // Ưu tiên nội dung admin đang gõ dở (gửi kèm body), nếu không thì lấy bản đã lưu
    let merged;
    if (req.body?.templates && typeof req.body.templates === 'object') {
      merged = tpl.mergeTemplates(req.body.templates);
    } else {
      const rec = await SystemSetting.findOne({ key: 'email_templates' });
      merged = tpl.mergeTemplates(rec?.value);
    }

    const { subject, html } = tpl.renderPreview(key, merged, frontendOrigin());
    res.json({ data: { subject, html } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Trạng thái hàng đợi email chào mừng cho tài khoản import. */
/**
 * Hàng đợi thư mời của tài khoản do admin import.
 * ?role=employer|candidate khoanh vùng theo loại tài khoản — trang import doanh
 * nghiệp và trang import sinh viên dùng chung endpoint nhưng đọc số của riêng mình.
 */
const welcomeQueueFilter = (role) =>
  role === 'employer' || role === 'candidate' ? { role } : {};

const getWelcomeEmailQueue = async (req, res) => {
  try {
    const worker = require('../services/welcomeEmailWorker');
    const filter = welcomeQueueFilter(req.query.role);
    const stats = await worker.getQueueStats(filter);

    // Danh sách những tài khoản gửi hỏng, kèm lý do — để admin biết ai chưa nhận
    const failedUsers = await User.find({ ...filter, welcomeEmailStatus: 'failed' })
      .select('email fullName studentId welcomeEmailTo welcomeEmailError welcomeEmailAttempts')
      .limit(50)
      .lean();

    res.json({ data: { ...stats, failedUsers } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Đưa các tài khoản gửi hỏng về lại hàng đợi. */
const retryWelcomeEmails = async (req, res) => {
  try {
    const worker = require('../services/welcomeEmailWorker');
    const filter = welcomeQueueFilter(req.query.role);
    const count = await worker.retryFailed(filter);

    await logAdminAction({
      req,
      action: filter.role === 'employer' ? 'IMPORT_EMPLOYERS' : 'IMPORT_USERS',
      targetModel: 'User',
      targetId: null,
      details: { retriedWelcomeEmails: count, role: filter.role || 'all' },
    });

    res.json({ message: `Đã xếp lại ${count} email vào hàng đợi.`, data: { count } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const triggerMatchingJob = async (req, res) => {
  try {
    // 1. Nhánh gửi email thử nghiệm (Mock data)
    if (req.query.test === 'true') {
      const emailService = require('../services/emailService');
      
      const mockJobs = [
        {
          id: 'mockjob1',
          title: 'Senior Fullstack Developer (Node.js & React)',
          location: 'Thành phố Hồ Chí Minh',
          companyName: 'CVMatchOne Demo Corp',
          previewScore: 96,
        },
        {
          id: 'mockjob2',
          title: 'AI Product Engineer (Python & Large Language Models)',
          location: 'Hà Nội',
          companyName: 'AI Innovations Lab',
          previewScore: 89,
        }
      ];

      // Email thử nghiệm luôn gửi về một hộp thư cố định của đội vận hành, không
      // gửi về email admin đang đăng nhập. Nhờ vậy ai bấm thử cũng không làm
      // phiền hộp thư người khác, và kết quả luôn kiểm tra được ở cùng một chỗ.
      const receiverEmail = process.env.TEST_EMAIL_RECIPIENT || 'lavender.pit.001@gmail.com';

      // Bản cũ báo "thành công" bất kể kết quả, vì sendJobMatchEmail nuốt mọi lỗi.
      // Nút kiểm tra mà luôn báo xanh thì không kiểm tra được gì — nhất là lúc
      // đang dò cấu hình SMTP.
      const result = await emailService.sendJobMatchEmail(
        { email: receiverEmail, fullName: 'Người dùng Thử nghiệm (Admin)' },
        mockJobs
      );

      if (!result?.sent) {
        return res.status(502).json({
          message: `Gửi email thử nghiệm THẤT BẠI: ${result?.error || 'lỗi không rõ'}`,
          data: { receiver: receiverEmail, emailsSent: 0 },
          email: emailService.getEmailConfig(),
        });
      }

      return res.json({
        message: `Đã gửi email thử nghiệm tới ${receiverEmail}. Kiểm tra cả hộp thư rác nếu không thấy.`,
        data: {
          receiver: receiverEmail,
          emailsSent: 1,
          messageId: result.messageId,
        },
      });
    }

    // 2. Nhánh chạy quét DB thật
    const { runMatchingProcess } = require('../cronJob');
    const stats = await runMatchingProcess();
    res.json({
      message: 'Kích hoạt tác vụ quét và gửi email thành công!',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getEmailSettings = async (req, res) => {
  try {
    let settingsRecord = await SystemSetting.findOne({ key: 'email_matching_settings' });
    if (!settingsRecord) {
      settingsRecord = await SystemSetting.create({
        key: 'email_matching_settings',
        value: {
          isEnabled: true,
          scheduleType: 'weekly',
          cronExpression: '0 15 * * 5',
        }
      });
    }
    res.json({ data: settingsRecord.value });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateEmailSettings = async (req, res) => {
  try {
    const { isEnabled, scheduleType, cronExpression } = req.body;
    
    // Validate custom cron expression format if scheduleType is custom
    if (scheduleType === 'custom') {
      if (!cronExpression || cronExpression.trim().split(/\s+/).length < 5) {
        return res.status(400).json({ message: 'Biểu thức Cron tùy chỉnh không hợp lệ (cần ít nhất 5 trường).' });
      }

      const minPart = cronExpression.trim().split(/\s+/)[0];
      const hourPart = cronExpression.trim().split(/\s+/)[1];
      
      // Block high frequency execution under 15 minutes for custom cron
      const isEveryMin = minPart === '*' && hourPart === '*';
      let isStepTooFrequent = false;
      if (minPart.startsWith('*/') && hourPart === '*') {
        const step = parseInt(minPart.replace('*/', ''), 10);
        if (!isNaN(step) && step < 15) isStepTooFrequent = true;
      }

      if (isEveryMin || isStepTooFrequent) {
        return res.status(400).json({
          message: 'Tần suất quá cao! Vui lòng chọn khoảng thời gian tối thiểu 15 phút hoặc chọn các phương án có sẵn.',
        });
      }
    }

    // Set standard cron expressions for pre-defined types
    let computedCron = cronExpression;
    if (scheduleType === 'demo') computedCron = '* * * * *';
    else if (scheduleType === 'hourly') computedCron = '0 * * * *';
    else if (scheduleType === 'daily') computedCron = '0 12 * * *';
    // Mặc định của hệ thống: 15h thứ Sáu hằng tuần (0 = Chủ nhật)
    else if (scheduleType === 'weekly') computedCron = '0 15 * * 5';

    const settingsRecord = await SystemSetting.findOneAndUpdate(
      { key: 'email_matching_settings' },
      {
        $set: {
          value: {
            isEnabled: !!isEnabled,
            scheduleType,
            cronExpression: computedCron,
          }
        }
      },
      { new: true, upsert: true }
    );

    // Dynamic reschedule cron!
    const { reloadCronJobs } = require('../cronJob');
    await reloadCronJobs();

    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'SystemSetting',
      targetId: settingsRecord._id,
      details: { key: 'email_matching_settings', value: settingsRecord.value },
    });

    res.json({
      message: 'Cập nhật cấu hình gửi email thành công!',
      data: settingsRecord.value,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAiMonitor = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    // processingStatus KHÔNG đủ để biết AI có chạy không: hồ sơ vẫn được lưu
    // với status 'ready' dù embedding rỗng. Phải đếm riêng số hồ sơ có nội dung
    // nhưng thiếu vector — đó mới là số tin làm điểm phù hợp bằng 0.
    const missingEmbeddingFilter = {
      $and: [
        { $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }] },
        {
          $or: [
            { headline: { $nin: [null, ''] } },
            { summary: { $nin: [null, ''] } },
            { 'skills.0': { $exists: true } },
            { 'experience.0': { $exists: true } },
            { 'education.0': { $exists: true } },
          ],
        },
      ],
    };

    const [
      total,
      readyCount,
      completedCount,
      failedCount,
      processingCount,
      queuedCount,
      missingEmbedding,
      emptyProfiles,
    ] = await Promise.all([
      CvProfile.countDocuments(),
      CvProfile.countDocuments({ processingStatus: 'ready' }),
      CvProfile.countDocuments({ processingStatus: 'completed' }),
      CvProfile.countDocuments({ processingStatus: 'failed' }),
      CvProfile.countDocuments({ processingStatus: 'processing' }),
      CvProfile.countDocuments({ processingStatus: 'queued' }),
      CvProfile.countDocuments(missingEmbeddingFilter),
      CvProfile.countDocuments({
        $and: [
          { $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }] },
          { headline: { $in: [null, ''] } },
          { summary: { $in: [null, ''] } },
          { 'skills.0': { $exists: false } },
          { 'experience.0': { $exists: false } },
          { 'education.0': { $exists: false } },
        ],
      }),
    ]);

    let filter = {};
    if (status === 'missing-embedding') {
      filter = missingEmbeddingFilter;
    } else if (status && status !== 'all') {
      filter.processingStatus = status;
    }

    const cvs = await CvProfile.find(filter)
      .populate('userId', 'fullName email')
      .select('fullName email headline processingStatus processingError attempts lastAiAttemptAt fileUrl createdAt updatedAt embedding')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const filteredTotal = await CvProfile.countDocuments(filter);

    res.json({
      stats: {
        total,
        ready: readyCount + completedCount,
        failed: failedCount,
        processing: processingCount,
        queued: queuedCount,
        missingEmbedding,
        emptyProfiles,
      },
      // Không trả cả vector 768 số về client, chỉ cần biết có hay không
      data: cvs.map((cv) => {
        const o = cv.toObject();
        o.hasEmbedding = (o.embedding || []).length > 0;
        delete o.embedding;
        return o;
      }),
      total: filteredTotal,
      page,
      pages: Math.ceil(filteredTotal / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const retryCvAi = async (req, res) => {
  try {
    const profile = await CvProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ CV' });
    }

    profile.processingStatus = 'queued';
    profile.processingError = null;
    profile.attempts = 0;
    profile.lastAiAttemptAt = new Date();
    await profile.save();

    await logAdminAction({
      req,
      action: 'RETRY_AI_PARSING',
      targetModel: 'CvProfile',
      targetId: profile._id,
      details: { fullName: profile.fullName, email: profile.email, hasFile: Boolean(profile.fileUrl) },
    });

    // Hồ sơ nhập tay không có PDF: worker sẽ nhúng lại từ các trường đã nhập
    // chứ không chạy đường bóc tách PDF. Nói rõ để admin không chờ nhầm.
    res.json({
      message: profile.fileUrl
        ? 'Đã đưa CV vào hàng đợi bóc tách lại bằng AI!'
        : 'Hồ sơ này không có file PDF — đã xếp hàng để tạo lại vector từ nội dung đã nhập.',
      data: profile,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const retryAllFailedCvAi = async (req, res) => {
  try {
    const failedCvs = await CvProfile.find({ processingStatus: 'failed' });
    const count = failedCvs.length;

    if (count === 0) {
      return res.json({ message: 'Không có CV nào ở trạng thái lỗi', queuedCount: 0 });
    }

    await CvProfile.updateMany(
      { processingStatus: 'failed' },
      {
        $set: {
          processingStatus: 'queued',
          processingError: null,
          attempts: 0,
          lastAiAttemptAt: new Date(),
        },
      }
    );

    await logAdminAction({
      req,
      action: 'RETRY_AI_PARSING',
      targetModel: 'CvProfile',
      targetId: null,
      details: { queuedCount: count, bulk: true },
    });

    res.json({ message: `Đã xếp hàng ${count} CV bị lỗi để xử lý lại AI`, queuedCount: count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const SystemBroadcast = require('../models/SystemBroadcast');
const { processBroadcastAsync } = require('../services/broadcastWorker');

const createBroadcast = async (req, res) => {
  try {
    const { title, message, targetGroup, sendEmail, sendInApp } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Tiêu đề và nội dung thông báo là bắt buộc.' });
    }

    const broadcast = await SystemBroadcast.create({
      title,
      message,
      targetGroup: targetGroup || 'all',
      sendEmail: sendEmail !== false,
      sendInApp: sendInApp !== false,
      status: 'processing',
      createdAdminId: req.user._id,
    });

    await logAdminAction({
      req,
      action: 'CREATE_SYSTEM_BROADCAST',
      targetModel: 'SystemBroadcast',
      targetId: broadcast._id,
      details: { title, targetGroup, sendEmail, sendInApp },
    });

    // Launch background worker non-blockingly using setImmediate
    setImmediate(() => {
      processBroadcastAsync(broadcast._id);
    });

    res.status(202).json({
      message: 'Thông báo toàn hệ thống đã được tạo và đang được phát ngầm thành công!',
      broadcastId: broadcast._id,
      data: broadcast,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBroadcasts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const total = await SystemBroadcast.countDocuments();
    const broadcasts = await SystemBroadcast.find()
      .populate('createdAdminId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ data: broadcasts, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWelcomeEmailQueue,
  retryWelcomeEmails,
  getEmailTemplates,
  updateEmailTemplates,
  previewEmailTemplate,
  checkEmailConnection,
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
};
