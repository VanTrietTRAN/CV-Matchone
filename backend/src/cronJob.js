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
const { findPrimaryOrLatestCv } = require("./utils/primaryCv");

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

// ─── Ngân sách thư gợi ý (làn P2) cho một lượt cron ──────────────────────────
//
// Cron không gửi thư nữa mà xếp vào outbox; worker gửi dần trong khung giờ và
// trần của làn P2 (xem services/mail/policy.js). Ở đây chặn hai thứ:
//   - chỉ xếp thư cho người còn hoạt động (đăng nhập trong 14–30 ngày gần nhất);
//   - không xếp quá sức gửi của 48 giờ — phần còn lại để lượt sau. Danh sách
//     duyệt theo lastSuggestionEmailAt tăng dần, nên lượt sau tới nhóm khác.
const mailOutbox = require("./services/mail/outbox");
const mailGovernor = require("./services/mail/governor");

const createMailBudget = async () => {
  const [budget, activeDays] = await Promise.all([
    mailOutbox.p2Budget(),
    mailGovernor.activeWindowDays(),
  ]);
  return {
    left: budget,
    activeSince: new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000),
    activeDays,
    queued: 0,
    skippedInactive: 0,
    skippedBudget: 0,
  };
};

/** Người này có được xếp thư P2 ở lượt này không? Đếm lý do để log cho rõ. */
const canQueueFor = (mail, user) => {
  if (!user?.lastActiveAt || new Date(user.lastActiveAt) < mail.activeSince) {
    mail.skippedInactive += 1;
    return false;
  }
  if (mail.left <= 0) {
    mail.skippedBudget += 1;
    return false;
  }
  return true;
};

const noteQueued = (mail, result) => {
  if (result?.queued) {
    mail.left -= 1;
    mail.queued += 1;
  }
  return Boolean(result?.queued);
};

// Returns true if candidate has active alerts (caller should skip CV fallback)
const runAlertMatching = async (candidate, cv, openJobs, mail) => {
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

    let delivered = matchedJobs.length === 0;
    if (matchedJobs.length > 0 && canQueueFor(mail, candidate)) {
      matchedJobs.sort((a, b) => b.finalScore - a.finalScore);
      delivered = noteQueued(
        mail,
        await emailService.queueJobAlertEmail({
          target: { email: alert.email || candidate.email, fullName: cv?.fullName },
          alert: { keyword: alert.keyword, location: alert.location, frequency: alert.frequency },
          jobs: matchedJobs,
          userId: candidate._id,
          alertId: alert._id,
        }),
      );
    }

    // Chỉ dời mốc khi đã xếp được thư (hoặc không có gì để gửi). Trước đây mốc
    // luôn dời, nên kỳ nào gửi hỏng là các tin khớp của kỳ đó mất vĩnh viễn.
    if (delivered) {
      alert.lastNotifiedAt = new Date();
      await alert.save();
    }
  }

  return true;
};

// Fallback when candidate has no JobAlerts
const runCvMatching = async (candidate, cv, openJobs, mail) => {
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

    // Tin đã báo cho ứng viên ở kỳ trước thì không đưa vào thư nữa — trước đây
    // mỗi kỳ cron gửi lại đúng những tin cũ.
    const candidateNotifExists = await Notification.findOne({
      userId: candidate._id,
      type: "job_match",
      jobId: job._id,
    });
    if (candidateNotifExists) continue;

    const companyName = await resolveCompanyName(job);
    matchedJobs.push({
      id: job._id,
      title: job.title,
      location: job.location,
      companyName,
      previewScore: percent,
    });

    await Notification.create({
      userId: candidate._id,
      type: "job_match",
      title: `Cơ hội việc làm mới phù hợp: ${job.title}`,
      body: `Hệ thống AI phát hiện bạn phù hợp ${percent}% với vị trí này tại ${companyName} (dựa trên CV: ${cv.fullName}).`,
      matchingScore: percent,
      jobId: job._id,
      cvProfileId: cv._id,
    });

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

  if (matchedJobs.length > 0 && canQueueFor(mail, candidate)) {
    matchedJobs.sort((a, b) => b.previewScore - a.previewScore);
    noteQueued(
      mail,
      await emailService.queueJobMatchEmail({
        user: { email: candidate.email, fullName: cv.fullName },
        userId: candidate._id,
        jobs: matchedJobs,
      }),
    );
  }
};

// ─── Tổng hợp hồ sơ phù hợp gửi doanh nghiệp (15h hằng ngày) ─────────────────
//
// Khác với thông báo trong ứng dụng (tạo ngay lúc ứng viên nộp), email này gom
// toàn bộ hồ sơ điểm cao trong ngày thành MỘT thư cho mỗi doanh nghiệp. Doanh
// nghiệp đăng nhiều tin sẽ nhận một thư duy nhất thay vì hàng chục thư rời.
const DEFAULT_EMPLOYER_THRESHOLD = 70;
const WEEK_HOURS = 24 * 7;
// Cho phép lệch nửa ngày: cron chạy đúng 15h mỗi ngày, nếu đòi tròn 7×24 giờ thì
// lần thứ 7 luôn sớm hơn vài giây và bị đẩy sang ngày thứ 8.
const WEEKLY_MIN_GAP_MS = 6.5 * 24 * 60 * 60 * 1000;

/**
 * Doanh nghiệp này có nhận email tổng hợp trong lượt chạy hôm nay không, và nếu
 * có thì gom hồ sơ trong bao nhiêu giờ trở lại đây.
 *
 * Trang Cài đặt email cho doanh nghiệp chọn "Hằng ngày (15h)" / "Hằng tuần" và
 * có công tắc tắt hẳn (lưu 'off'). Trước đây cron đọc mỗi `isEmailSubscribed`,
 * nên bật "Hằng tuần" hay tắt công tắc đều không thay đổi gì: thư vẫn về mỗi ngày.
 */
const employerDigestWindow = (employer, defaultHours, now) => {
  const freq = employer.jobMatchFrequency || 'daily';
  if (freq === 'off') return { skip: 'đã tắt email tổng hợp' };
  if (freq !== 'weekly') return { hours: defaultHours };

  const last = employer.lastDigestEmailAt ? new Date(employer.lastDigestEmailAt) : null;
  if (last && now - last < WEEKLY_MIN_GAP_MS) return { skip: 'chọn hằng tuần, chưa tới kỳ' };
  // Kỳ hằng tuần gom cả tuần chứ không phải 24 giờ như lịch hằng ngày, nếu không
  // thì "hằng tuần" hoá ra là "mỗi tuần xem một ngày", bỏ sót 6 ngày còn lại.
  return { hours: WEEK_HOURS };
};

const runEmployerDigest = async () => {
  const startedAt = new Date();
  console.log("[Cron/Employer] Bắt đầu tổng hợp hồ sơ phù hợp lúc:", startedAt.toLocaleString());

  const settings = await SystemSetting.findOne({ key: "employer_digest_settings" });
  const threshold = Number(settings?.value?.minMatchScore) || DEFAULT_EMPLOYER_THRESHOLD;
  const hours = Number(settings?.value?.lookbackHours) || 24;
  // Lấy rộng nhất (cả tuần) rồi cắt lại theo cửa sổ của từng doanh nghiệp ở dưới:
  // doanh nghiệp chọn hằng tuần cần 7 ngày, chọn hằng ngày vẫn chỉ thấy `hours` giờ.
  const since = new Date(Date.now() - Math.max(hours, WEEK_HOURS) * 60 * 60 * 1000);

  // Lấy theo ngưỡng mặc định trước, rồi lọc lại theo ngưỡng riêng của từng doanh
  // nghiệp ở dưới. Doanh nghiệp đặt ngưỡng thấp hơn mặc định vẫn nhận đủ hồ sơ.
  // Không đặt sàn cứng: doanh nghiệp đặt ngưỡng 30% vẫn phải thấy hồ sơ 40%.
  // Mỗi doanh nghiệp lọc lại theo ngưỡng riêng ở dưới.
  const LOWEST_THRESHOLD = 0;
  const applications = await Application.find({
    appliedAt: { $gte: since },
    matchingScore: { $gte: Math.min(threshold, LOWEST_THRESHOLD) },
  })
    .populate("jobId", "title employerId status")
    .populate("cvProfileId", "fullName headline skills")
    .sort({ matchingScore: -1 });

  if (!applications.length) {
    console.log(
      `[Cron/Employer] Không có hồ sơ nào đạt ${threshold}% trong ${Math.max(hours, WEEK_HOURS)} giờ qua.`,
    );
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
      appliedAtRaw: app.appliedAt,
      appliedAt: new Date(app.appliedAt).toLocaleString("vi-VN", {
        timeZone: CRON_TIMEZONE,
      }),
    });
  }

  const now = new Date();
  const mail = await createMailBudget();
  let sentCount = 0;
  let skippedByFrequency = 0;
  for (const [employerId, allApplicants] of byEmployer) {
    const employer = await User.findById(employerId).select(
      "email status isDeleted isEmailSubscribed minMatchScore jobMatchFrequency employerDigestLimit lastDigestEmailAt lastActiveAt"
    );
    // Tôn trọng đúng các điều kiện như email ứng viên: còn hoạt động, chưa xoá,
    // và chưa tắt nhận email
    if (!employer || employer.status !== "active" || employer.isDeleted) continue;
    if (employer.isEmailSubscribed === false) continue;

    const window = employerDigestWindow(employer, hours, now);
    if (window.skip) {
      skippedByFrequency += 1;
      continue;
    }
    const windowStart = new Date(now.getTime() - window.hours * 60 * 60 * 1000);

    // Cài đặt riêng của doanh nghiệp (trang Cài đặt email) đè lên mặc định hệ thống
    const ownThreshold = Number(employer.minMatchScore) || threshold;
    const applicants = allApplicants
      .filter((a) => a.score >= ownThreshold && new Date(a.appliedAtRaw) >= windowStart)
      .sort((a, b) => b.score - a.score);
    if (!applicants.length) continue;
    if (!canQueueFor(mail, employer)) continue;

    // 0 nghĩa là không giới hạn
    const limit = Number(employer.employerDigestLimit) || 0;
    const finalList = limit > 0 ? applicants.slice(0, limit) : applicants;

    const profile = await CompanyProfile.findOne({ userId: employerId }).select("companyName");

    // Xếp vào outbox P2. Mốc lastDigestEmailAt (cho tần suất "hằng tuần") do
    // worker ghi lúc thư thật sự đi — xem services/mail/outboxWorker.js.
    const result = await emailService.queueEmployerDigestEmail({
      employer: { email: employer.email, companyName: profile?.companyName || "" },
      applicants: finalList,
      threshold: ownThreshold,
      userId: employer._id,
    });
    if (noteQueued(mail, result)) sentCount += 1;
  }

  console.log(
    `[Cron/Employer] Xong: xếp ${sentCount}/${byEmployer.size} thư tổng hợp vào hàng đợi, ` +
      `${applications.length} hồ sơ đạt ngưỡng ${threshold}%` +
      (skippedByFrequency ? `, ${skippedByFrequency} bỏ qua theo tần suất đã chọn` : '') +
      (mail.skippedInactive ? `, ${mail.skippedInactive} không hoạt động ${mail.activeDays} ngày` : '') +
      (mail.skippedBudget ? `, ${mail.skippedBudget} để lượt sau (hết ngân sách P2)` : '') +
      '.'
  );
  return {
    employersNotified: sentCount,
    emailsQueued: mail.queued,
    skippedInactive: mail.skippedInactive,
    skippedBudget: mail.skippedBudget,
    employersMatched: byEmployer.size,
    skippedByFrequency,
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

  const mail = await createMailBudget();
  let sentCount = 0;
  for (const [employerId, list] of byEmployer) {
    const employer = await User.findById(employerId).select(
      "email status isDeleted jobExpiryReminder lastActiveAt",
    );
    if (!employer || employer.status !== "active" || employer.isDeleted) continue;
    // Mặc định bật; chỉ bỏ qua khi doanh nghiệp tắt tường minh
    if (employer.jobExpiryReminder === false) continue;
    // Không đánh dấu đã nhắc: người bỏ qua vì không hoạt động / hết ngân sách
    // vẫn được xét lại ở lượt sau.
    if (!canQueueFor(mail, employer)) continue;

    // Số hồ sơ đã nhận, để doanh nghiệp cân nhắc có đáng gia hạn không
    for (const item of list) {
      item.applicationCount = await Application.countDocuments({ jobId: item._id });
    }

    const profile = await CompanyProfile.findOne({ userId: employerId }).select("companyName");
    const result = await emailService.queueJobExpiringEmail({
      employer: { email: employer.email, companyName: profile?.companyName || "" },
      jobs: list,
      days,
      userId: employer._id,
    });

    if (noteQueued(mail, result)) {
      sentCount += 1;
      // Đánh dấu đã nhắc ngay lúc xếp hàng để lượt sau không xếp trùng
      await Job.updateMany(
        { _id: { $in: list.map((j) => j._id) } },
        { $set: { lastExpiryReminderAt: new Date() } },
      );
    }
  }

  console.log(
    `[Cron/Expiry] Xong: xếp ${sentCount}/${byEmployer.size} thư nhắc hạn vào hàng đợi, ${jobs.length} tin sắp hết hạn` +
      (mail.skippedInactive ? `, ${mail.skippedInactive} doanh nghiệp không hoạt động ${mail.activeDays} ngày` : '') +
      (mail.skippedBudget ? `, ${mail.skippedBudget} để lượt sau` : '') +
      '.',
  );
  return { employersNotified: sentCount, jobsFlagged: jobs.length, warningDays: days };
};

// Một lượt quét chạy cùng lúc là đủ: bấm "Chạy ngay" khi cron cũng đang chạy
// trước đây là hai lượt song song, xếp trùng thư cho cùng ứng viên.
const running = { matching: false, digest: false, expiry: false };
const exclusive = (key, fn) => async (...args) => {
  if (running[key]) {
    console.warn(`[Cron] Bỏ qua: lượt ${key} trước vẫn đang chạy.`);
    return { skipped: true, reason: 'Lượt trước vẫn đang chạy.' };
  }
  running[key] = true;
  try {
    return await fn(...args);
  } finally {
    running[key] = false;
  }
};

const runMatchingProcessImpl = async () => {
  console.log(
    "[Cron/Trigger] Đang chạy tác vụ quét việc làm matching lúc:",
    new Date().toLocaleString()
  );
  
  let candidatesProcessed = 0;

  try {
    // Chỉ tin còn hiển thị: chưa xoá mềm, chưa hết hạn, chưa tắt gửi email
    const now = new Date();
    const openJobs = await Job.find({
      status: "open",
      isDeleted: { $ne: true },
      isEmailEnabled: { $ne: false },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).populate(
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
    //
    // Ba điều kiện còn lại là những người KHÔNG được nhận thư, trước đây bị bỏ sót
    // (email tổng hợp gửi doanh nghiệp đã lọc đúng, phía ứng viên thì chưa):
    //   - status 'banned': đã bị khoá mà vẫn nhận gợi ý việc làm hằng ngày.
    //   - isDeleted: tài khoản đã xoá mềm, đáng lẽ im lặng hoàn toàn.
    //   - emailVerified === false: chưa bấm xác thực nên login còn chặn, gửi thư
    //     gợi ý việc làm tới đó là gửi vào một địa chỉ chưa ai xác nhận là thật.
    // Đều dùng $ne để tài khoản cũ (trường undefined) vẫn nhận thư như trước.
    //
    // Cohort rotation: người lâu chưa nhận thư gợi ý xếp trước. Ngân sách P2 của
    // lượt này hết thì những người sau vẫn có thông báo trong ứng dụng, chỉ thư
    // để lượt sau — và lượt sau họ đứng đầu danh sách.
    const candidates = await User.find({
      role: "candidate",
      isEmailSubscribed: { $ne: false },
      status: { $ne: "banned" },
      isDeleted: { $ne: true },
      emailVerified: { $ne: false },
    }).sort({ lastSuggestionEmailAt: 1, _id: 1 });

    const mail = await createMailBudget();

    for (const candidate of candidates) {
      const cv = await findPrimaryOrLatestCv(candidate._id);

      // Check matching
      const handledByAlerts = await runAlertMatching(candidate, cv, openJobs, mail);
      if (!handledByAlerts) {
        await runCvMatching(candidate, cv, openJobs, mail);
      }
      candidatesProcessed++;
    }

    console.log(
      `[Cron/Trigger] Đã xử lý xong: ${candidatesProcessed} ứng viên, xếp ${mail.queued} thư gợi ý vào hàng đợi` +
        (mail.skippedInactive ? `, ${mail.skippedInactive} bỏ qua vì không hoạt động ${mail.activeDays} ngày` : '') +
        (mail.skippedBudget ? `, ${mail.skippedBudget} để lượt sau (hết ngân sách P2)` : '') +
        '.'
    );
    return {
      openJobsCount: openJobs.length,
      candidatesProcessed,
      emailsQueued: mail.queued,
      skippedInactive: mail.skippedInactive,
      skippedBudget: mail.skippedBudget,
    };
  } catch (error) {
    console.error("[Cron/Trigger] Lỗi khi chạy tác vụ matching:", error.message);
    throw error;
  }
};

const runMatchingProcess = exclusive('matching', runMatchingProcessImpl);
const runEmployerDigestOnce = exclusive('digest', runEmployerDigest);
const runJobExpiryReminderOnce = exclusive('expiry', runJobExpiryReminder);

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
          // 15h thứ Sáu. node-cron đánh số ngày trong tuần từ 0 (Chủ nhật),
          // nên thứ Sáu là 5.
          cronExpression: '0 15 * * 5',
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

    // 2. Tắt lịch gợi ý ứng viên KHÔNG được tắt lây hai lịch của doanh nghiệp —
    //    bản cũ `return` sớm ở đây nên tổng hợp hồ sơ 15h và nhắc hạn 9h cũng mất.
    if (!isEnabled) {
      console.log('[Cron] Tác vụ quét matching gửi email tự động đang TẮT theo cấu hình hệ thống.');
    } else {
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
    }

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
          await runEmployerDigestOnce();
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
          await runJobExpiryReminderOnce();
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
  runEmployerDigest: runEmployerDigestOnce,
  runJobExpiryReminder: runJobExpiryReminderOnce,
  reloadCronJobs: startCronJobs,
};
