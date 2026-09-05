const cron = require("node-cron");
const User = require("./models/User");
const CvProfile = require("./models/CvProfile");
const Job = require("./models/Job");
const JobAlert = require("./models/JobAlert");
const Application = require("./models/Application");
const CompanyProfile = require("./models/CompanyProfile");
const Notification = require("./models/Notification");
const SystemSetting = require("./models/SystemSetting");
const aiService = require("./services/aiService");
const emailService = require("./services/emailService");
const { matchJobToAlert, isAlertDue } = require("./utils/alertMatching");

// Múi giờ phải khai báo tường minh. Không có option này, node-cron dùng giờ hệ
// thống của container — Railway chạy UTC, nên "0 12 * * *" mà ta hiểu là 12h trưa
// sẽ thực sự chạy lúc 19h giờ Việt Nam. Lệch 7 tiếng, không có dấu hiệu nào trong log.
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'Asia/Ho_Chi_Minh';

// Floor AI score for jobs that already passed hard alert filters
const ALERT_BASE_SCORE = 60;

const resolveCompanyName = async (job) => {
  const companyProf = await CompanyProfile.findOne({
    userId: job.employerId?._id || job.employerId,
  });
  return (
    companyProf?.companyName ||
    job.employerId?.email ||
    "Đối tác của CVMatchOne"
  );
};

const calcAiPercent = async (cv, job) => {
  if (!cv?.embedding?.length || !job?.embedding?.length) return null;
  try {
    const raw = await aiService.calculateMatchingScore(cv.embedding, job.embedding);
    return Math.round(Math.min(1, Math.max(0, raw)) * 100);
  } catch {
    return null;
  }
};

const ensureCandidateNotif = async (candidate, cv, job, companyName, score, keyword) => {
  const exists = await Notification.findOne({
    userId: candidate._id,
    type: "job_match",
    jobId: job._id,
  });
  if (exists) return;
  await Notification.create({
    userId: candidate._id,
    type: "job_match",
    title: `Việc làm mới khớp thông báo "${keyword}": ${job.title}`,
    body: `Vị trí này tại ${companyName} khớp ${score}% với thông báo việc làm của bạn (từ khoá: ${keyword}).`,
    matchingScore: score,
    jobId: job._id,
    cvProfileId: cv?._id || null,
  });
};

// Returns true if candidate has active alerts (caller should skip CV fallback)
const runAlertMatching = async (candidate, cv, openJobs) => {
  const alerts = await JobAlert.find({ userId: candidate._id, isActive: true });
  if (!alerts.length) return false;

  for (const alert of alerts) {
    if (!isAlertDue(alert)) continue;

    const since = alert.lastNotifiedAt || alert.createdAt;
    const matchedJobs = [];

    for (const job of openJobs) {
      if (new Date(job.createdAt) <= new Date(since)) continue;

      const hasApplied = await Application.findOne({
        candidateId: candidate._id,
        jobId: job._id,
      });
      if (hasApplied) continue;

      const aiPercent = await calcAiPercent(cv, job);
      const relevance =
        aiPercent != null ? Math.max(ALERT_BASE_SCORE, aiPercent) : ALERT_BASE_SCORE;

      const result = matchJobToAlert(alert, job, relevance);
      if (!result) continue;
      if (result.finalScore < alert.minMatchScore) continue;

      const companyName = await resolveCompanyName(job);
      matchedJobs.push({
        id: job._id,
        title: job.title,
        location: job.location,
        salary: job.salary,
        companyName,
        finalScore: result.finalScore,
        matchedBy: result.matchedBy,
      });

      await ensureCandidateNotif(
        candidate,
        cv,
        job,
        companyName,
        result.finalScore,
        alert.keyword
      );
    }

    if (matchedJobs.length > 0) {
      matchedJobs.sort((a, b) => b.finalScore - a.finalScore);
      await emailService.sendJobAlertEmail(
        { email: alert.email || candidate.email, fullName: cv?.fullName },
        { keyword: alert.keyword, location: alert.location, frequency: alert.frequency },
        matchedJobs
      );
    }

    alert.lastNotifiedAt = new Date();
    await alert.save();
  }

  return true;
};

// Fallback when candidate has no JobAlerts
const runCvMatching = async (candidate, cv, openJobs) => {
  if (!cv || !cv.isLookingForJob || !cv.embedding || cv.embedding.length === 0) {
    return;
  }

  const minMatchScore = candidate.minMatchScore || 70;
  const matchedJobs = [];

  for (const job of openJobs) {
    const hasApplied = await Application.findOne({
      candidateId: candidate._id,
      jobId: job._id,
    });
    if (hasApplied) continue;

    const percent = await calcAiPercent(cv, job);
    if (percent == null || percent < minMatchScore) continue;

    const companyName = await resolveCompanyName(job);
    matchedJobs.push({
      id: job._id,
      title: job.title,
      location: job.location,
      companyName,
      previewScore: percent,
    });

    const candidateNotifExists = await Notification.findOne({
      userId: candidate._id,
      type: "job_match",
      jobId: job._id,
    });
    if (!candidateNotifExists) {
      await Notification.create({
        userId: candidate._id,
        type: "job_match",
        title: `Cơ hội việc làm mới phù hợp: ${job.title}`,
        body: `Hệ thống AI phát hiện bạn phù hợp ${percent}% với vị trí này tại ${companyName} (dựa trên CV: ${cv.fullName}).`,
        matchingScore: percent,
        jobId: job._id,
        cvProfileId: cv._id,
      });
    }

    const employerId = job.employerId?._id || job.employerId;
    const employerNotifExists = await Notification.findOne({
      userId: employerId,
      type: "job_match",
      jobId: job._id,
      candidateId: candidate._id,
    });
    if (!employerNotifExists) {
      await Notification.create({
        userId: employerId,
        type: "job_match",
        title: `Ứng viên tiềm năng mới cho: ${job.title}`,
        body: `Hệ thống AI phát hiện ứng viên ${cv.fullName} phù hợp ${percent}% với yêu cầu tuyển dụng.`,
        matchingScore: percent,
        jobId: job._id,
        candidateId: candidate._id,
        cvProfileId: cv._id,
      });
    }
  }

  if (matchedJobs.length > 0) {
    matchedJobs.sort((a, b) => b.previewScore - a.previewScore);
    await emailService.sendJobMatchEmail(
      { email: candidate.email, fullName: cv.fullName },
      matchedJobs
    );
  }
};

// ─── Tổng hợp hồ sơ phù hợp gửi doanh nghiệp (15h hằng ngày) ─────────────────
//
// Khác với thông báo trong ứng dụng (tạo ngay lúc ứng viên nộp), email này gom
// toàn bộ hồ sơ điểm cao trong ngày thành MỘT thư cho mỗi doanh nghiệp. Doanh
// nghiệp đăng nhiều tin sẽ nhận một thư duy nhất thay vì hàng chục thư rời.
const DEFAULT_EMPLOYER_THRESHOLD = 70;

const runEmployerDigest = async () => {
  const startedAt = new Date();
  console.log("[Cron/Employer] Bắt đầu tổng hợp hồ sơ phù hợp lúc:", startedAt.toLocaleString());

  const settings = await SystemSetting.findOne({ key: "employer_digest_settings" });
  const threshold = Number(settings?.value?.minMatchScore) || DEFAULT_EMPLOYER_THRESHOLD;
  const hours = Number(settings?.value?.lookbackHours) || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Lấy theo ngưỡng mặc định trước, rồi lọc lại theo ngưỡng riêng của từng doanh
  // nghiệp ở dưới. Doanh nghiệp đặt ngưỡng thấp hơn mặc định vẫn nhận đủ hồ sơ.
  const LOWEST_THRESHOLD = 50;
  const applications = await Application.find({
    appliedAt: { $gte: since },
    matchingScore: { $gte: Math.min(threshold, LOWEST_THRESHOLD) },
  })
    .populate("jobId", "title employerId status")
    .populate("cvProfileId", "fullName headline skills")
    .sort({ matchingScore: -1 });

  if (!applications.length) {
    console.log(`[Cron/Employer] Không có hồ sơ nào đạt ${threshold}% trong ${hours} giờ qua.`);
    return { employersNotified: 0, applicationsConsidered: 0, threshold };
  }

  // Gom theo doanh nghiệp
  const byEmployer = new Map();
  for (const app of applications) {
    const job = app.jobId;
    if (!job || !job.employerId) continue;

    const employerId = String(job.employerId);
    if (!byEmployer.has(employerId)) byEmployer.set(employerId, []);
    byEmployer.get(employerId).push({
      fullName: app.cvProfileId?.fullName || "Ứng viên",
      headline: app.cvProfileId?.headline || "",
      skills: app.cvProfileId?.skills || [],
      jobTitle: job.title,
      score: app.matchingScore,
      appliedAt: new Date(app.appliedAt).toLocaleString("vi-VN", {
        timeZone: CRON_TIMEZONE,
      }),
    });
  }

  let sentCount = 0;
  for (const [employerId, allApplicants] of byEmployer) {
    const employer = await User.findById(employerId).select(
      "email status isDeleted isEmailSubscribed minMatchScore jobMatchFrequency employerDigestLimit"
    );
    // Tôn trọng đúng các điều kiện như email ứng viên: còn hoạt động, chưa xoá,
    // và chưa tắt nhận email
    if (!employer || employer.status !== "active" || employer.isDeleted) continue;
    if (employer.isEmailSubscribed === false) continue;

    // Cài đặt riêng của doanh nghiệp (trang Cài đặt email) đè lên mặc định hệ thống
    const ownThreshold = Number(employer.minMatchScore) || threshold;
    const applicants = allApplicants
      .filter((a) => a.score >= ownThreshold)
      .sort((a, b) => b.score - a.score);
    if (!applicants.length) continue;

    // 0 nghĩa là không giới hạn
    const limit = Number(employer.employerDigestLimit) || 0;
    const finalList = limit > 0 ? applicants.slice(0, limit) : applicants;

    const profile = await CompanyProfile.findOne({ userId: employerId }).select("companyName");

    const result = await emailService.sendEmployerDigestEmail({
      employer: { email: employer.email, companyName: profile?.companyName || "" },
      applicants: finalList,
      threshold: ownThreshold,
    });
    if (result?.sent) sentCount += 1;
  }

  console.log(
    `[Cron/Employer] Xong: ${sentCount}/${byEmployer.size} doanh nghiệp nhận thư, ` +
      `${applications.length} hồ sơ đạt ngưỡng ${threshold}%.`
  );
  return {
    employersNotified: sentCount,
    employersMatched: byEmployer.size,
    applicationsConsidered: applications.length,
    threshold,
  };
};

// ─── Nhắc hạn tin tuyển dụng (9h hằng ngày) ──────────────────────────────────
//
// Tin hết hạn là ngừng hiển thị với ứng viên, nhưng doanh nghiệp thường không để
// ý cho tới khi thấy hồ sơ ngừng về. Nhắc trước vài ngày để kịp gia hạn.
//
// Chỉ nhắc MỘT LẦN cho mỗi tin: sau khi gửi, ghi lastExpiryReminderAt để lượt sau
// bỏ qua — không có mốc này thì tin sắp hết hạn sẽ bị nhắc lại mỗi ngày.
const DEFAULT_EXPIRY_WARNING_DAYS = 7;

const runJobExpiryReminder = async () => {
  console.log("[Cron/Expiry] Bắt đầu quét tin sắp hết hạn lúc:", new Date().toLocaleString());

  const settings = await SystemSetting.findOne({ key: "job_expiry_settings" });
  const days = Number(settings?.value?.warningDays) || DEFAULT_EXPIRY_WARNING_DAYS;
  const now = new Date();
  const limitDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const jobs = await Job.find({
    status: "open",
    expiresAt: { $gt: now, $lte: limitDate },
    $or: [
      { lastExpiryReminderAt: { $exists: false } },
      { lastExpiryReminderAt: null },
    ],
  }).select("title expiresAt employerId");

  if (!jobs.length) {
    console.log("[Cron/Expiry] Không có tin nào cần nhắc.");
    return { employersNotified: 0, jobsFlagged: 0, warningDays: days };
  }

  const byEmployer = new Map();
  for (const job of jobs) {
    const employerId = String(job.employerId);
    if (!byEmployer.has(employerId)) byEmployer.set(employerId, []);
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(job.expiresAt) - now) / (24 * 60 * 60 * 1000)),
    );
    byEmployer.get(employerId).push({
      _id: job._id,
      id: String(job._id),
      title: job.title,
      expiresAt: new Date(job.expiresAt).toLocaleDateString("vi-VN", { timeZone: CRON_TIMEZONE }),
      daysLeft,
    });
  }

  let sentCount = 0;
  for (const [employerId, list] of byEmployer) {
    const employer = await User.findById(employerId).select(
      "email status isDeleted jobExpiryReminder",
    );
    if (!employer || employer.status !== "active" || employer.isDeleted) continue;
    // Mặc định bật; chỉ bỏ qua khi doanh nghiệp tắt tường minh
    if (employer.jobExpiryReminder === false) continue;

    // Số hồ sơ đã nhận, để doanh nghiệp cân nhắc có đáng gia hạn không
    for (const item of list) {
      item.applicationCount = await Application.countDocuments({ jobId: item._id });
    }

    const profile = await CompanyProfile.findOne({ userId: employerId }).select("companyName");
    const result = await emailService.sendJobExpiringEmail({
      employer: { email: employer.email, companyName: profile?.companyName || "" },
      jobs: list,
      days,
    });

    if (result?.sent) {
      sentCount += 1;
      // Đánh dấu đã nhắc để không gửi lại mỗi ngày cho cùng một tin
      await Job.updateMany(
        { _id: { $in: list.map((j) => j._id) } },
        { $set: { lastExpiryReminderAt: new Date() } },
      );
    }
  }

  console.log(
    `[Cron/Expiry] Xong: ${sentCount}/${byEmployer.size} doanh nghiệp nhận thư, ${jobs.length} tin sắp hết hạn.`,
  );
  return { employersNotified: sentCount, jobsFlagged: jobs.length, warningDays: days };
};

const runMatchingProcess = async () => {
  console.log(
    "[Cron/Trigger] Đang chạy tác vụ quét việc làm matching lúc:",
    new Date().toLocaleString()
  );
  
  let candidatesProcessed = 0;
  let emailsSent = 0; // matching logs will count email sends or approximate them

  try {
    const openJobs = await Job.find({ status: "open" }).populate(
      "employerId",
      "email"
    );
    if (!openJobs || openJobs.length === 0) {
      console.log("[Cron/Trigger] Không có tin tuyển dụng nào đang mở.");
      return { openJobsCount: 0, candidatesProcessed: 0 };
    }

    // $ne: false thay vì === true, để tài khoản tạo trước khi có trường này
    // (giá trị undefined) vẫn nhận được thư. Người dùng tắt tường minh thì bỏ qua,
    // và bật lại sẽ tự nhận ở lượt thứ Năm kế tiếp — không cần thao tác gì thêm.
    const candidates = await User.find({
      role: "candidate",
      isEmailSubscribed: { $ne: false },
    });

    for (const candidate of candidates) {
      let cv = await CvProfile.findOne({
        userId: candidate._id,
        isPrimary: true,
      });
      if (!cv) {
        cv = await CvProfile.findOne({ userId: candidate._id }).sort({
          createdAt: -1,
        });
      }

      // Check matching
      const handledByAlerts = await runAlertMatching(candidate, cv, openJobs);
      if (!handledByAlerts) {
        await runCvMatching(candidate, cv, openJobs);
      }
      candidatesProcessed++;
    }

    console.log(`[Cron/Trigger] Đã xử lý xong: ${candidatesProcessed} ứng viên.`);
    return {
      openJobsCount: openJobs.length,
      candidatesProcessed,
    };
  } catch (error) {
    console.error("[Cron/Trigger] Lỗi khi chạy tác vụ matching:", error.message);
    throw error;
  }
};

let activeCronTask = null;
let employerCronTask = null;
let expiryCronTask = null;

const startCronJobs = async () => {
  try {
    let settingsRecord = await SystemSetting.findOne({ key: 'email_matching_settings' });
    if (!settingsRecord) {
      settingsRecord = await SystemSetting.create({
        key: 'email_matching_settings',
        value: {
          isEnabled: true,
          scheduleType: 'weekly',
          // Thứ Năm 14h. node-cron đánh số ngày trong tuần từ 0 (Chủ nhật),
          // nên thứ Năm là 4.
          cronExpression: '0 14 * * 4',
        }
      });
    }

    const { isEnabled, cronExpression } = settingsRecord.value;

    // 1. Stop active cron task if exists
    if (activeCronTask) {
      console.log('[Cron] Đang dừng tác vụ cron cũ...');
      activeCronTask.stop();
      activeCronTask = null;
    }

    // 2. If disabled, do not schedule new task
    if (!isEnabled) {
      console.log('[Cron] Tác vụ quét matching gửi email tự động đang TẮT theo cấu hình hệ thống.');
      return;
    }

    // 3. Schedule cron task
    //
    // Múi giờ phải khai báo tường minh. Không có option này, node-cron dùng giờ
    // hệ thống của container — Railway chạy UTC, nên "0 7 * * *" mà admin hiểu là
    // 7h sáng sẽ thực sự chạy lúc 14h chiều giờ Việt Nam. Lỗi lệch 7 tiếng này
    // không có dấu hiệu nào trong log, chỉ phát hiện khi user hỏi sao nhận mail
    // vào giờ lạ.

    console.log(
      `[Cron] Đã khởi động tác vụ quét matching gửi email ` +
      `(Lịch trình: ${cronExpression} — múi giờ ${CRON_TIMEZONE})`
    );

    activeCronTask = cron.schedule(cronExpression, async () => {
      try {
        await runMatchingProcess();
      } catch (err) {
        // already logged
      }
    }, { timezone: CRON_TIMEZONE });

    // ─── Tổng hợp hồ sơ gửi doanh nghiệp ─────────────────────────────────────
    // Lịch riêng, cố định 15h, không dùng chung cấu hình với email ứng viên vì
    // hai bên phục vụ hai đối tượng và hai nhịp làm việc khác nhau.
    if (employerCronTask) {
      employerCronTask.stop();
      employerCronTask = null;
    }
    const employerSettings = await SystemSetting.findOne({ key: 'employer_digest_settings' });
    const employerEnabled = employerSettings?.value?.isEnabled !== false;
    const employerCron = employerSettings?.value?.cronExpression || '0 15 * * *';

    if (employerEnabled) {
      console.log(
        `[Cron] Đã khởi động tác vụ tổng hợp hồ sơ gửi doanh nghiệp ` +
        `(Lịch trình: ${employerCron} — múi giờ ${CRON_TIMEZONE})`
      );
      employerCronTask = cron.schedule(employerCron, async () => {
        try {
          await runEmployerDigest();
        } catch (err) {
          console.error('[Cron/Employer] Lỗi:', err.message);
        }
      }, { timezone: CRON_TIMEZONE });
    } else {
      console.log('[Cron] Tác vụ tổng hợp hồ sơ gửi doanh nghiệp đang TẮT theo cấu hình.');
    }
    // ─── Nhắc hạn tin tuyển dụng ─────────────────────────────────────────────
    if (expiryCronTask) {
      expiryCronTask.stop();
      expiryCronTask = null;
    }
    const expirySettings = await SystemSetting.findOne({ key: 'job_expiry_settings' });
    const expiryEnabled = expirySettings?.value?.isEnabled !== false;
    const expiryCron = expirySettings?.value?.cronExpression || '0 9 * * *';

    if (expiryEnabled) {
      console.log(
        `[Cron] Đã khởi động tác vụ nhắc hạn tin tuyển dụng ` +
        `(Lịch trình: ${expiryCron} — múi giờ ${CRON_TIMEZONE})`
      );
      expiryCronTask = cron.schedule(expiryCron, async () => {
        try {
          await runJobExpiryReminder();
        } catch (err) {
          console.error('[Cron/Expiry] Lỗi:', err.message);
        }
      }, { timezone: CRON_TIMEZONE });
    } else {
      console.log('[Cron] Tác vụ nhắc hạn tin tuyển dụng đang TẮT theo cấu hình.');
    }
  } catch (error) {
    console.error('[Cron] Lỗi khi khởi động tác vụ email cron:', error.message);
  }
};

module.exports = {
  startCronJobs,
  runMatchingProcess,
  runEmployerDigest,
  runJobExpiryReminder,
  reloadCronJobs: startCronJobs,
};
