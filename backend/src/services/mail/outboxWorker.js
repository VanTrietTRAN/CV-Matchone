const cron = require('node-cron');
const EmailOutbox = require('../../models/EmailOutbox');
const User = require('../../models/User');
const governor = require('./governor');
const { LANES } = require('./policy');

/**
 * Worker gửi thư làn P2 từ outbox.
 *
 * Mỗi lượt (30 giây) gửi tối đa MỘT thư — nhịp thật do governor quyết (giãn
 * cách, trần giờ, khung 09:00–17:00, ngày nghỉ, breaker). Lượt nào chưa tới
 * nhịp thì dừng ngay ở bước `peek`, không truy vấn outbox.
 */

const SCHEDULE = '*/30 * * * * *';
const MAX_ATTEMPTS = 3;
const STUCK_MS = 10 * 60 * 1000;

let running = false;
let task = null;

/** Thư quá hạn 48h: huỷ thay vì dồn sang hôm sau nữa. */
const expireStale = async (now) => {
  const r = await EmailOutbox.updateMany(
    { status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired', error: 'Quá 48 giờ chưa tới lượt gửi — tự huỷ.' } },
  );
  if (r.modifiedCount) console.log(`[Outbox] Huỷ ${r.modifiedCount} thư P2 quá hạn 48 giờ.`);

  // Thư kẹt ở 'sending' (server tắt giữa chừng): không biết đã đi hay chưa, nên
  // đánh hỏng thay vì gửi lại — gửi trùng còn hại uy tín hơn thiếu một thư gợi ý.
  await EmailOutbox.updateMany(
    { status: 'sending', lockedAt: { $lte: new Date(now.getTime() - STUCK_MS) } },
    { $set: { status: 'failed', error: 'Bị gián đoạn khi đang gửi.' } },
  );
};

/** Người nhận còn hoạt động trong N ngày gần nhất không? (chỉ xét thư gắn với tài khoản) */
const recipientStillEligible = async (item, activeDays) => {
  if (!item.userId) return { ok: true };
  const user = await User.findById(item.userId)
    .select('lastActiveAt isDeleted status isEmailSubscribed')
    .lean();
  if (!user || user.isDeleted || user.status === 'banned') return { ok: false, reason: 'Tài khoản không còn hoạt động' };
  if (user.isEmailSubscribed === false && item.kind !== 'broadcast') {
    return { ok: false, reason: 'Người nhận đã tắt email' };
  }
  const since = Date.now() - activeDays * 24 * 60 * 60 * 1000;
  if (!user.lastActiveAt || new Date(user.lastActiveAt).getTime() < since) {
    return { ok: false, reason: `Không đăng nhập trong ${activeDays} ngày gần nhất` };
  }
  return { ok: true };
};

/** Việc cần làm sau khi thư đã đi (ghi mốc để xoay vòng nhóm nhận). */
const afterSent = async (item, now) => {
  if (!item.userId) return;
  const set = {};
  if (item.meta?.markSuggestion) set.lastSuggestionEmailAt = now;
  if (item.meta?.markDigest) set.lastDigestEmailAt = now;
  if (Object.keys(set).length) await User.updateOne({ _id: item.userId }, { $set: set });
};

const processOne = async () => {
  if (running) return { busy: true };
  running = true;
  try {
    const now = new Date();
    await expireStale(now);

    const gate = await governor.peek(LANES.P2, 1, now);
    if (!gate.ok) return { waiting: gate.reason };

    const item = await EmailOutbox.findOneAndUpdate(
      { status: 'pending', priority: LANES.P2, scheduledAfter: { $lte: now }, expiresAt: { $gt: now } },
      { $set: { status: 'sending', lockedAt: now } },
      { sort: { priority: 1, createdAt: 1 }, new: true },
    );
    if (!item) return { idle: true };

    const activeDays = await governor.activeWindowDays();
    const eligible = await recipientStillEligible(item, activeDays);
    if (!eligible.ok) {
      await EmailOutbox.updateOne({ _id: item._id }, { $set: { status: 'suppressed', error: eligible.reason } });
      return { skipped: eligible.reason };
    }

    const emailService = require('../emailService');
    const r = await emailService.deliverOutboxItem(item);

    if (r.sent) {
      await EmailOutbox.updateOne(
        { _id: item._id },
        { $set: { status: 'sent', sentAt: now, messageId: r.messageId }, $unset: { lockedAt: '' } },
      );
      await afterSent(item, now);
      return { sent: true };
    }
    if (r.suppressed) {
      await EmailOutbox.updateOne({ _id: item._id }, { $set: { status: 'suppressed', error: r.error } });
      return { skipped: r.error };
    }
    if (r.deferred || r.shared) {
      // Không phải lỗi của thư này: trả về hàng đợi, không tính lượt thử
      await EmailOutbox.updateOne({ _id: item._id }, { $set: { status: 'pending', error: r.error }, $unset: { lockedAt: '' } });
      return { waiting: r.error };
    }

    const attempts = (item.attempts || 0) + 1;
    await EmailOutbox.updateOne(
      { _id: item._id },
      {
        $set: { status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', attempts, error: r.error },
        $unset: { lockedAt: '' },
      },
    );
    return { failed: r.error };
  } finally {
    running = false;
  }
};

const initOutboxWorker = () => {
  if (task) return;
  console.log('[Outbox] Khởi động worker gửi thư P2 (kiểm tra mỗi 30 giây).');
  task = cron.schedule(SCHEDULE, async () => {
    try {
      await processOne();
    } catch (e) {
      console.error('[Outbox] Lỗi:', e.message);
    }
  });
};

module.exports = { initOutboxWorker, processOne };
