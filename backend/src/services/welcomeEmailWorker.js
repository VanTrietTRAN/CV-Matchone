const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const emailService = require('./emailService');
const { generatePassword } = require('../utils/passwordGenerator');

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

// Trần gửi mỗi ngày cho riêng loại thư này. Gói Brevo Free cho 300 email/ngày,
// chừa lại phần cho mã xác thực, đặt lại mật khẩu và hai email tổng hợp — những
// thứ người dùng đang chờ ngay lúc đó. Đụng trần thì hàng đợi tự nằm lại tới hôm
// sau thay vì đốt sạch quota rồi mọi loại thư khác cùng hỏng.
const DAILY_CAP = Number(process.env.WELCOME_EMAIL_DAILY_CAP) || 250;

/** Số thư chào mừng đã gửi kể từ 0h hôm nay. */
const sentTodayCount = async () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return User.countDocuments({ welcomeEmailSentAt: { $gte: start } });
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

  try {
    const alreadySent = await sentTodayCount();
    const remaining = DAILY_CAP - alreadySent;
    if (remaining <= 0) {
      return { sent: 0, failed: 0, capReached: true, dailyCap: DAILY_CAP };
    }

    const pending = await User.find({
      welcomeEmailStatus: 'pending',
      welcomeEmailAttempts: { $lt: MAX_ATTEMPTS },
      isDeleted: { $ne: true },
    })
      .sort({ importedAt: 1 }) // ai được tạo trước thì nhận thư trước
      .limit(Math.min(BATCH_SIZE, remaining));

    if (!pending.length) return { sent: 0, failed: 0 };

    for (const user of pending) {
      try {
        const password = generatePassword();
        user.password = await bcrypt.hash(password, await bcrypt.genSalt(10));
        user.mustChangePassword = true;
        await user.save();

        const result = await emailService.sendAccountCreatedEmail({ user, password });

        if (result?.sent) {
          user.welcomeEmailStatus = 'sent';
          user.welcomeEmailSentAt = new Date();
          user.welcomeEmailError = undefined;
          sent += 1;
        } else {
          user.welcomeEmailAttempts = (user.welcomeEmailAttempts || 0) + 1;
          user.welcomeEmailError = result?.error || 'Không rõ nguyên nhân';
          if (user.welcomeEmailAttempts >= MAX_ATTEMPTS) {
            user.welcomeEmailStatus = 'failed';
          }
          failed += 1;
        }
        await user.save();
      } catch (e) {
        failed += 1;
        try {
          user.welcomeEmailAttempts = (user.welcomeEmailAttempts || 0) + 1;
          user.welcomeEmailError = e.message;
          if (user.welcomeEmailAttempts >= MAX_ATTEMPTS) user.welcomeEmailStatus = 'failed';
          await user.save();
        } catch {
          // Ghi trạng thái thất bại cũng hỏng thì bỏ qua, lượt sau thử lại
        }
      }
    }

    console.log(`[WelcomeEmail] Đã gửi ${sent}, thất bại ${failed} trong lượt này.`);
    return { sent, failed };
  } finally {
    running = false;
  }
};

/** Số liệu cho trang quản trị. */
const getQueueStats = async () => {
  const [pending, sent, failed, sentToday] = await Promise.all([
    User.countDocuments({ welcomeEmailStatus: 'pending' }),
    User.countDocuments({ welcomeEmailStatus: 'sent' }),
    User.countDocuments({ welcomeEmailStatus: 'failed' }),
    sentTodayCount(),
  ]);
  const remainingToday = Math.max(0, DAILY_CAP - sentToday);
  return {
    pending,
    sent,
    failed,
    sentToday,
    dailyCap: DAILY_CAP,
    remainingToday,
    batchSize: BATCH_SIZE,
    intervalSeconds: 20,
    // Ước lượng thô để admin biết bao giờ xong, tính cả việc phải chờ sang ngày mới
    estimatedDaysLeft: pending > 0 ? Math.ceil(Math.max(0, pending - remainingToday) / DAILY_CAP) + (remainingToday > 0 ? 0 : 1) : 0,
  };
};

/** Đưa các tài khoản thất bại về lại hàng đợi. */
const retryFailed = async () => {
  const r = await User.updateMany(
    { welcomeEmailStatus: 'failed' },
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

module.exports = { initWelcomeEmailWorker, processBatch, getQueueStats, retryFailed, BATCH_SIZE, MAX_ATTEMPTS, DAILY_CAP };
