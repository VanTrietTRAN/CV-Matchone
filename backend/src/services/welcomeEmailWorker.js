const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const CompanyProfile = require('../models/CompanyProfile');
const emailService = require('./emailService');
const { generatePassword } = require('../utils/passwordGenerator');
const { schoolEmailOf, SCHOOL_EMAIL_DOMAIN } = require('../utils/schoolEmail');

/**
 * Gửi email chào mừng cho tài khoản sinh viên do admin import.
 *
 * Vì sao cần worker riêng thay vì gửi thẳng trong request import:
 *
 *   Lần import thật đầu tiên có 297 sinh viên. Email gửi đồng bộ trong vòng lặp,
 *   mỗi dòng mất ~6 giây, tổng cộng khoảng 30 phút — trong khi proxy trước
 *   backend ngắt kết nối sau vài phút. Admin thấy trang treo rồi báo lỗi, không
 *   biết đã tạo được bao nhiêu tài khoản; server thì vẫn lặng lẽ chạy tiếp.
 *
 * Nay import trả về ngay sau khi tạo tài khoản, còn việc gửi thư giao cho đây.
 *
 * Mật khẩu tạm sinh NGAY LÚC GỬI chứ không lưu sẵn: database không bao giờ chứa
 * mật khẩu dạng rõ, và mỗi lần thử lại là một mật khẩu mới nên không có chuyện
 * gửi đi một mật khẩu đã lộ ở lần thất bại trước.
 */

// Gói Brevo Free giới hạn 300 email/ngày. Gửi dồn dập vừa đụng trần vừa dễ bị
// đánh giá là spam, nên đi theo nhịp: mỗi lượt một nhúm nhỏ, cách nhau 20 giây.
const BATCH_SIZE = 15;
const MAX_ATTEMPTS = 3;
const SCHEDULE = '*/20 * * * * *'; // mỗi 20 giây

// Trần gửi mỗi ngày cho riêng loại thư này, đặt bằng đúng hạn mức của gói Brevo
// Free (300 email/ngày) theo yêu cầu — tức dùng hết quota cho thư chào mừng.
//
// Đánh đổi: hôm nào hàng đợi chạm 300 thì mã xác thực đăng ký, mã đặt lại mật
// khẩu và hai email tổng hợp đều không gửi được nữa cho tới nửa đêm. Muốn chừa
// lại một phần thì đặt biến WELCOME_EMAIL_DAILY_CAP nhỏ hơn (ví dụ 250).
//
// Đặt cao hơn 300 không có tác dụng: Brevo từ chối ngay, và mỗi lần bị từ chối
// vẫn tính là một lần thử của tài khoản đó nên chỉ tổ đốt lượt thử.
const BREVO_FREE_DAILY_LIMIT = 300;
const DAILY_CAP = Math.min(
  Number(process.env.WELCOME_EMAIL_DAILY_CAP) || BREVO_FREE_DAILY_LIMIT,
  BREVO_FREE_DAILY_LIMIT,
);

const SKIP_REASON =
  'Không gửi: sinh viên đã tự đặt mật khẩu trước khi tới lượt — gửi mật khẩu tạm mới sẽ ghi đè mật khẩu đó.';

const startOfToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * Số lượt gửi đã dùng kể từ 0h hôm nay.
 *
 * Brevo tính hạn mức theo NGƯỜI NHẬN chứ không theo lá thư: một lá gửi cùng lúc
 * tới gmail và email trường là 2 lượt. Đếm theo lá thì hàng đợi tưởng còn quota,
 * gửi tiếp, rồi bị Brevo chặn giữa chừng.
 */
const sentTodayCount = async () => {
  const start = startOfToday();
  const [personal, school] = await Promise.all([
    User.countDocuments({ welcomeEmailSentAt: { $gte: start } }),
    User.countDocuments({ schoolEmailSentAt: { $gte: start } }),
  ]);
  return personal + school;
};

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
    personal: toPersonal,
    school: toSchool,
  };
};

/**
 * Lỗi này là do hệ thống hay do riêng người nhận?
 *
 * Hết quota, mất kết nối, sai thông tin đăng nhập đều sẽ lặp lại y hệt với mọi
 * tài khoản còn trong hàng đợi. Đếm chúng vào lượt thử của từng người là sai —
 * chỉ tổ đẩy cả hàng đợi sang trạng thái failed vì một nguyên nhân duy nhất.
 */
const SHARED_FAILURE = /quota|limit exceeded|rate limit|535|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|Chưa cấu hình|chưa phải SMTP|giá trị mẫu|too many/i;
const isSharedFailure = (reason) => SHARED_FAILURE.test(String(reason || ''));

/** Chỉ ghi log mỗi nguyên nhân một lần, tránh đầy log khi hàng đợi lớn. */
let lastLoggedProblem = null;
const logConfigProblemOnce = (text) => {
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
    // Chưa cấu hình được SMTP thì KHÔNG đụng vào hàng đợi. Nếu cứ chạy, mọi tài
    // khoản đều hỏng vì cùng một lý do, và sau 3 lượt là cả nghìn tài khoản bị
    // đánh dấu failed dù bản thân chúng không có gì sai — admin phải bấm gửi lại
    // toàn bộ. Lỗi cấu hình phải sửa ở cấu hình, không tính vào lượt thử của ai.
    const cfg = emailService.getEmailConfig();
    if (!cfg.configured) {
      logConfigProblemOnce(cfg.problems.join(' '));
      return { sent: 0, failed: 0, notConfigured: true, problems: cfg.problems };
    }

    let remaining = DAILY_CAP - (await sentTodayCount());
    if (remaining <= 0) {
      return { sent: 0, failed: 0, capReached: true, dailyCap: DAILY_CAP };
    }

    const pending = await User.find({
      welcomeEmailStatus: 'pending',
      welcomeEmailAttempts: { $lt: MAX_ATTEMPTS },
      isDeleted: { $ne: true },
      // Admin khoá tài khoản ngay sau khi import (import nhầm danh sách chẳng
      // hạn) thì thư mời kèm mật khẩu tạm không được gửi đi nữa.
      status: { $ne: 'banned' },
    })
      .sort({ importedAt: 1 }) // ai được tạo trước thì nhận thư trước
      .limit(Math.min(BATCH_SIZE, remaining));

    if (!pending.length) return { sent: 0, failed: 0 };

    let stop = null;

    for (const user of pending) {
      // Sinh viên đã tự đặt mật khẩu (đổi ở lần đăng nhập đầu, hoặc qua Quên mật
      // khẩu) thì tuyệt đối không gửi mật khẩu tạm mới — làm vậy là ghi đè mật
      // khẩu họ đang dùng. Chuyện này xảy ra được với thư gửi bù tới email trường,
      // vì người đó đã nhận thư ở gmail và có thể đã đăng nhập từ trước.
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

      // Thư gửi cả hai địa chỉ tốn 2 lượt. Không đủ thì để dành sang hôm sau
      // thay vì gửi thiếu một địa chỉ.
      if (recipients.to.length > remaining) {
        stop = { capReached: true, dailyCap: DAILY_CAP };
        break;
      }

      try {
        const password = generatePassword();
        const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        // Tên và địa chỉ công ty nằm ở CompanyProfile, không ở User — thư mời
        // doanh nghiệp xưng hô bằng tên công ty nên phải đọc thêm hồ sơ này.
        const company = isEmployerAccount(user)
          ? await CompanyProfile.findOne({ userId: user._id }).select('companyName phone address')
          : null;

        // Gửi TRƯỚC, ghi mật khẩu SAU. Bản cũ làm ngược lại: hễ gửi hỏng — mà hết
        // quota là chuyện hằng ngày — thì mật khẩu đã bị thay còn thư mới chưa tới.
        // Với thư gửi bù, đó là người vừa nhận mật khẩu ở gmail bỗng không đăng
        // nhập được nữa. Nếu gửi xong mà ghi hỏng, tài khoản vẫn 'pending' và lượt
        // sau gửi lại một mật khẩu mới dùng được — tự lành, chỉ thừa một thư.
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
          const stamps = {
            ...(recipients.personal ? { welcomeEmailSentAt: now } : {}),
            ...(recipients.school ? { schoolEmailSentAt: now } : {}),
          };

          // Điều kiện mustChangePassword: true chặn trường hợp sinh viên đổi mật
          // khẩu đúng lúc thư đang trên đường đi — không đè mật khẩu họ vừa đặt.
          const r = await User.updateOne(
            { _id: user._id, mustChangePassword: true },
            {
              $set: { password: hash, welcomeEmailStatus: 'sent', ...stamps },
              $unset: { welcomeEmailError: '' },
            },
          );

          if (r.matchedCount) {
            sent += 1;
          } else {
            await User.updateOne(
              { _id: user._id },
              { $set: { welcomeEmailStatus: 'skipped', welcomeEmailError: SKIP_REASON, ...stamps } },
            );
            skipped += 1;
          }
          remaining -= recipients.to.length;
        } else {
          const reason = result?.error || 'Không rõ nguyên nhân';

          // Lỗi dùng chung cho mọi người nhận (hết quota ngày của Brevo, mất kết
          // nối, sai thông tin đăng nhập) không phải lỗi của tài khoản này. Dừng
          // cả lượt và để nguyên lượt thử — lượt sau hoặc hôm sau chạy lại.
          if (isSharedFailure(reason)) {
            logConfigProblemOnce(reason);
            await User.updateOne({ _id: user._id }, { $set: { welcomeEmailError: reason } });
            stop = { halted: true, reason };
            break;
          }

          await recordFailure(user, reason);
          failed += 1;
        }
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
  // trong ngày thì vẫn là con số chung — cả hai loại thư tiêu cùng một quota.
  const [pending, sent, failed, skipped, schoolSent, sentToday, pendingByTarget] = await Promise.all([
    User.countDocuments({ ...filter, welcomeEmailStatus: 'pending' }),
    User.countDocuments({ ...filter, welcomeEmailStatus: 'sent' }),
    User.countDocuments({ ...filter, welcomeEmailStatus: 'failed' }),
    User.countDocuments({ ...filter, welcomeEmailStatus: 'skipped' }),
    User.countDocuments({ ...filter, schoolEmailSentAt: { $exists: true } }),
    sentTodayCount(),
    User.aggregate([
      { $match: { ...filter, welcomeEmailStatus: 'pending' } },
      { $group: { _id: '$welcomeEmailTo', n: { $sum: 1 } } },
    ]),
  ]);

  // Số lượt Brevo cần để gửi hết: thư gửi cả hai địa chỉ tính 2
  const pendingRecipients = pendingByTarget.reduce((sum, g) => sum + g.n * (g._id === 'both' ? 2 : 1), 0);
  const remainingToday = Math.max(0, DAILY_CAP - sentToday);

  return {
    pending,
    sent,
    failed,
    skipped,
    schoolSent,
    schoolDomain: SCHOOL_EMAIL_DOMAIN,
    pendingRecipients,
    sentToday,
    dailyCap: DAILY_CAP,
    remainingToday,
    batchSize: BATCH_SIZE,
    intervalSeconds: 20,
    // Số ngày phải chờ thêm ngoài hôm nay (0 = xong trong hôm nay)
    estimatedDaysLeft:
      pendingRecipients > remainingToday
        ? Math.ceil((pendingRecipients - remainingToday) / DAILY_CAP)
        : 0,
  };
};

/** Đưa các tài khoản thất bại về lại hàng đợi. */
const retryFailed = async (filter = {}) => {
  const r = await User.updateMany(
    { ...filter, welcomeEmailStatus: 'failed' },
    { $set: { welcomeEmailStatus: 'pending', welcomeEmailAttempts: 0, welcomeEmailError: null } },
  );
  return r.modifiedCount;
};

const initWelcomeEmailWorker = () => {
  if (task) return;
  console.log(`[WelcomeEmail] Khởi động worker gửi email chào mừng (${BATCH_SIZE} thư / 20 giây).`);
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
  BATCH_SIZE,
  MAX_ATTEMPTS,
  DAILY_CAP,
};
