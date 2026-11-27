const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const CompanyProfile = require('../models/CompanyProfile');
const emailService = require('./emailService');
const governor = require('./mail/governor');
const policy = require('./mail/policy');
const { generatePassword } = require('../utils/passwordGenerator');
const { schoolEmailOf, SCHOOL_EMAIL_DOMAIN } = require('../utils/schoolEmail');

/**
 * Gửi thư mời (kèm mật khẩu tạm) cho tài khoản do admin import — làn P1.
 *
 * Vì sao cần worker riêng thay vì gửi thẳng trong request import:
 *
 *   Lần import thật đầu tiên có 297 sinh viên. Email gửi đồng bộ trong vòng lặp,
 *   mỗi dòng mất ~6 giây, tổng cộng khoảng 30 phút — trong khi proxy trước
 *   backend ngắt kết nối sau vài phút.
 *
 * Vì sao không còn "15 thư mỗi 20 giây, tối đa 300/ngày":
 *
 *   Chạy kịch trần 300 thư/ngày nhiều ngày liền bằng danh sách lạnh là nguyên
 *   nhân thư rơi vào Spam — kéo theo cả thư đổi mật khẩu. Nay worker chỉ là
 *   người nhặt việc; nhịp gửi do governor quyết: tối đa 100 lượt/ngày (thấp hơn
 *   trong 3 tuần warm-up), 20 thư/giờ, giãn 60–90 giây ngẫu nhiên, nghỉ Chủ nhật,
 *   và dừng hẳn khi Circuit Breaker ngắt. Xem services/mail/policy.js.
 *
 * Mật khẩu tạm sinh NGAY LÚC GỬI chứ không lưu sẵn: database không bao giờ chứa
 * mật khẩu dạng rõ, và mỗi lần thử lại là một mật khẩu mới.
 */

const MAX_ATTEMPTS = 3;
const SCHEDULE = '*/20 * * * * *'; // mỗi 20 giây nhìn hàng đợi một lần
const PICK = 3; // số hồ sơ nhặt mỗi lượt; thường chỉ gửi được 1 vì nhịp 60–90 giây

/** Trần đầy đủ của làn P1 khi warm-up xong (100 với gói 300/ngày). */
const DAILY_CAP = policy.limits().p1;

const SKIP_REASON =
  'Không gửi: sinh viên đã tự đặt mật khẩu trước khi tới lượt — gửi mật khẩu tạm mới sẽ ghi đè mật khẩu đó.';

/**
 * Hàng đợi này phục vụ cả hai loại tài khoản do admin import: sinh viên (ứng
 * viên) và doanh nghiệp. Mọi thứ dùng chung — nhịp gửi, hạn mức ngày, cách sinh
 * mật khẩu — chỉ khác nội dung thư, vì người đọc là hai đối tượng khác hẳn nhau.
 */
const isEmployerAccount = (user) => user.role === 'employer';

/**
 * Thư của tài khoản này gửi tới đâu, theo `welcomeEmailTo`:
 *   personal — chỉ email đăng nhập (mặc định, và là mọi tài khoản import cũ)
 *   school   — chỉ email trường: gửi bù cho người đã nhận thư ở gmail từ trước
 *   both     — cả hai trong cùng một lá, nên cùng một mật khẩu
 */
const recipientsFor = (user) => {
  const target = user.welcomeEmailTo || 'personal';
  const personal = String(user.email || '').toLowerCase();
  const school = schoolEmailOf(user.studentId);

  const toPersonal = target !== 'school';
  // Email đăng nhập trùng luôn email trường thì chỉ gửi một lần
  const toSchool = target !== 'personal' && Boolean(school) && school !== personal;

  return {
    target,
    to: [toPersonal && personal, toSchool && school].filter(Boolean),
    personal: toPersonal ? personal : null,
    school: toSchool ? school : null,
  };
};

/** Chỉ ghi log mỗi nguyên nhân một lần, tránh đầy log khi hàng đợi lớn. */
let lastLoggedProblem = null;
const logPauseOnce = (text) => {
  if (lastLoggedProblem === text) return;
  lastLoggedProblem = text;
  console.warn(`[WelcomeEmail] Tạm dừng hàng đợi: ${text}`);
};

/** Ghi một lần thử thất bại vì lý do riêng của tài khoản này. */
const recordFailure = async (user, reason) => {
  const attempts = (user.welcomeEmailAttempts || 0) + 1;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        welcomeEmailAttempts: attempts,
        welcomeEmailError: reason,
        ...(attempts >= MAX_ATTEMPTS ? { welcomeEmailStatus: 'failed' } : {}),
      },
    },
  );
};

let running = false;
let task = null;

/** Xử lý một lượt. Trả về số thư đã gửi. */
const processBatch = async () => {
  // Không cho hai lượt chồng lên nhau: một lượt chậm sẽ khiến lượt sau lấy
  // trùng hồ sơ và gửi hai lần cho cùng một sinh viên.
  if (running) return { sent: 0, skippedBusy: true };
  running = true;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Chưa cấu hình được SMTP thì KHÔNG đụng vào hàng đợi: mọi tài khoản sẽ hỏng
    // vì cùng một lý do, và sau 3 lượt là cả nghìn tài khoản bị đánh dấu failed.
    const cfg = emailService.getEmailConfig();
    if (!cfg.configured) {
      logPauseOnce(cfg.problems.join(' '));
      return { sent: 0, failed: 0, notConfigured: true, problems: cfg.problems };
    }

    // Chưa tới nhịp / hết suất / breaker ngắt / ngày nghỉ: khỏi truy vấn hàng đợi
    const gate = await governor.peek(policy.LANES.P1);
    if (!gate.ok) return { sent: 0, failed: 0, waiting: gate.reason };

    const paused = await governor.pausedBatchIds();
    const pending = await User.find({
      welcomeEmailStatus: 'pending',
      welcomeEmailAttempts: { $lt: MAX_ATTEMPTS },
      isDeleted: { $ne: true },
      // Admin khoá tài khoản ngay sau khi import (import nhầm danh sách chẳng
      // hạn) thì thư mời kèm mật khẩu tạm không được gửi đi nữa.
      status: { $ne: 'banned' },
      ...(paused.length ? { importBatchId: { $nin: paused } } : {}),
    })
      .sort({ importedAt: 1 }) // ai được tạo trước thì nhận thư trước
      .limit(PICK);

    if (!pending.length) return { sent: 0, failed: 0 };

    let stop = null;

    for (const user of pending) {
      // Đã tự đặt mật khẩu thì tuyệt đối không gửi mật khẩu tạm mới — làm vậy là
      // ghi đè mật khẩu họ đang dùng.
      if (user.mustChangePassword !== true) {
        await User.updateOne(
          { _id: user._id },
          { $set: { welcomeEmailStatus: 'skipped', welcomeEmailError: SKIP_REASON } },
        );
        skipped += 1;
        continue;
      }

      const recipients = recipientsFor(user);
      if (!recipients.to.length) {
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              welcomeEmailStatus: 'failed',
              welcomeEmailError: 'Không có MSSV hợp lệ để dựng địa chỉ email trường.',
            },
          },
        );
        failed += 1;
        continue;
      }

      try {
        const password = generatePassword();
        const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        const company = isEmployerAccount(user)
          ? await CompanyProfile.findOne({ userId: user._id }).select('companyName phone address')
          : null;

        // Gửi TRƯỚC, ghi mật khẩu SAU: gửi hỏng thì mật khẩu cũ vẫn còn nguyên.
        const result = isEmployerAccount(user)
          ? await emailService.sendCompanyAccountCreatedEmail({ user, company, password })
          : await emailService.sendAccountCreatedEmail({
              user,
              password,
              to: recipients.to,
              mode: recipients.target,
            });

        if (result?.sent) {
          const now = new Date();
          const got = new Set(result.recipients || recipients.to);
          const stamps = {
            ...(recipients.personal && got.has(recipients.personal) ? { welcomeEmailSentAt: now } : {}),
            ...(recipients.school && got.has(recipients.school) ? { schoolEmailSentAt: now } : {}),
          };

          // Điều kiện mustChangePassword: true chặn trường hợp sinh viên đổi mật
          // khẩu đúng lúc thư đang trên đường đi — không đè mật khẩu họ vừa đặt.
          const r = await User.updateOne(
            { _id: user._id, mustChangePassword: true },
            {
              $set: { password: hash, welcomeEmailStatus: 'sent', ...stamps },
              $inc: { welcomeEmailSendCount: 1 },
              $unset: { welcomeEmailError: '' },
            },
          );

          if (r.matchedCount) {
            sent += 1;
          } else {
            await User.updateOne(
              { _id: user._id },
              {
                $set: { welcomeEmailStatus: 'skipped', welcomeEmailError: SKIP_REASON, ...stamps },
                $inc: { welcomeEmailSendCount: 1 },
              },
            );
            skipped += 1;
          }
          // Mỗi lượt chỉ một thư: nhịp giãn cách do governor giữ
          break;
        }

        if (result?.deferred || result?.shared) {
          // Không phải lỗi của tài khoản này (chưa tới nhịp, hết suất, breaker
          // ngắt, SMTP chưa cấu hình) — để nguyên lượt thử, lượt sau chạy lại.
          logPauseOnce(result.error);
          stop = { waiting: result.error };
          break;
        }

        if (result?.suppressed) {
          // Địa chỉ đã hard bounce / báo spam / huỷ nhận: thử lại cũng vô ích
          await User.updateOne(
            { _id: user._id },
            { $set: { welcomeEmailStatus: 'failed', welcomeEmailAttempts: MAX_ATTEMPTS, welcomeEmailError: result.error } },
          );
          failed += 1;
          continue;
        }

        const reason = result?.error || 'Không rõ nguyên nhân';
        await recordFailure(user, reason);
        failed += 1;
        // SMTP vừa từ chối: dừng lượt này, để breaker đếm lỗi trước khi thử tiếp
        break;
      } catch (e) {
        failed += 1;
        try {
          await recordFailure(user, e.message);
        } catch {
          // Ghi trạng thái thất bại cũng hỏng thì bỏ qua, lượt sau thử lại
        }
      }
    }

    if (sent || failed || skipped) {
      console.log(`[WelcomeEmail] Đã gửi ${sent}, thất bại ${failed}, bỏ qua ${skipped} trong lượt này.`);
    }
    return { sent, failed, skipped, ...(stop || {}) };
  } finally {
    running = false;
  }
};

/** Số liệu cho trang quản trị. */
const getQueueStats = async (filter = {}) => {
  // `filter` khoanh vùng theo vai trò (vd { role: 'employer' }) để trang import
  // doanh nghiệp không hiện lẫn số liệu của hàng đợi sinh viên. Hạn mức gửi
  // trong ngày thì vẫn là con số chung — cả hai loại thư tiêu cùng làn P1.
  // Cùng bộ lọc với processBatch: tài khoản khoá / đã xoá không bao giờ được
  // gửi, đếm chúng vào "đang chờ" là hàng đợi không bao giờ về 0.
  filter = { ...filter, isDeleted: { $ne: true }, status: { $ne: 'banned' } };
  const [pending, sent, failed, skipped, schoolSent, pendingByTarget, health] = await Promise.all([
    User.countDocuments({ ...filter, welcomeEmailStatus: 'pending' }),
    User.countDocuments({ ...filter, welcomeEmailStatus: 'sent' }),
    User.countDocuments({ ...filter, welcomeEmailStatus: 'failed' }),
    User.countDocuments({ ...filter, welcomeEmailStatus: 'skipped' }),
    User.countDocuments({ ...filter, schoolEmailSentAt: { $exists: true } }),
    User.aggregate([
      { $match: { ...filter, welcomeEmailStatus: 'pending' } },
      { $group: { _id: '$welcomeEmailTo', n: { $sum: 1 } } },
    ]),
    governor.getHealth(),
  ]);

  // Số lượt Brevo cần để gửi hết: thư gửi cả hai địa chỉ tính 2
  const pendingRecipients = pendingByTarget.reduce((sum, g) => sum + g.n * (g._id === 'both' ? 2 : 1), 0);
  const lane = health.quota.lanes.find((l) => l.lane === policy.LANES.P1);
  const dailyCap = lane.cap;
  const sentToday = lane.sent || 0;
  const remainingToday = Math.max(0, dailyCap - sentToday);
  // Ước tính theo trần của bậc warm-up hiện tại (bỏ qua giảm tốc tạm thời)
  const stageCap = Math.max(1, Math.round(policy.limits().p1 * policy.WARMUP[health.warmup.stage].p1));

  return {
    pending,
    sent,
    failed,
    skipped,
    schoolSent,
    schoolDomain: SCHOOL_EMAIL_DOMAIN,
    pendingRecipients,
    sentToday,
    dailyCap,
    remainingToday,
    hourlyCap: policy.PACING[policy.LANES.P1].perHour,
    gapSeconds: [policy.PACING[policy.LANES.P1].gapMinMs / 1000, policy.PACING[policy.LANES.P1].gapMaxMs / 1000],
    // Giữ tên cũ cho giao diện cũ
    batchSize: policy.PACING[policy.LANES.P1].perHour,
    intervalSeconds: policy.PACING[policy.LANES.P1].gapMinMs / 1000,
    estimatedDaysLeft:
      pendingRecipients > remainingToday ? Math.ceil((pendingRecipients - remainingToday) / stageCap) : 0,
    breaker: health.breaker,
    cooldownToday: health.quota.cooldownToday,
    warmup: health.warmup,
    pausedBatches: health.pausedBatches,
  };
};

/** Đưa các tài khoản thất bại về lại hàng đợi (trừ địa chỉ đã bị chặn). */
const retryFailed = async (filter = {}) => {
  const EmailSuppression = require('../models/EmailSuppression');
  const blocked = await EmailSuppression.find({}).select('email').lean();
  const r = await User.updateMany(
    {
      ...filter,
      welcomeEmailStatus: 'failed',
      isDeleted: { $ne: true },
      status: { $ne: 'banned' },
      email: { $nin: blocked.map((b) => b.email) },
    },
    { $set: { welcomeEmailStatus: 'pending', welcomeEmailAttempts: 0, welcomeEmailError: null } },
  );
  return r.modifiedCount;
};

const initWelcomeEmailWorker = () => {
  if (task) return;
  console.log('[WelcomeEmail] Khởi động worker thư mời (làn P1, nhịp do governor quyết).');
  task = cron.schedule(SCHEDULE, async () => {
    try {
      await processBatch();
    } catch (e) {
      console.error('[WelcomeEmail] Lỗi:', e.message);
    }
  });
};

module.exports = {
  initWelcomeEmailWorker,
  processBatch,
  getQueueStats,
  retryFailed,
  recipientsFor,
  MAX_ATTEMPTS,
  DAILY_CAP,
};
