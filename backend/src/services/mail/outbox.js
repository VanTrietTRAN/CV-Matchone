const EmailOutbox = require('../../models/EmailOutbox');
const governor = require('./governor');
const policy = require('./policy');

/**
 * Xếp thư làn P2 vào hàng đợi. Cron và broadcast gọi hàm này thay vì gửi thẳng;
 * worker (outboxWorker.js) gửi dần theo nhịp và trần của làn P2.
 */

/**
 * @param {{kind: string, to: string, userId?: any, subject: string, html: string,
 *          dedupeKey?: string, meta?: object}} item
 * @returns {Promise<{queued: boolean, reason?: string}>}
 */
const enqueue = async ({ kind, to, userId, subject, html, dedupeKey, meta }) => {
  const addr = String(to || '').toLowerCase().trim();
  if (!addr) return { queued: false, reason: 'Thiếu địa chỉ nhận' };

  const blocked = await governor.suppressedAmong([addr]);
  if (blocked.has(addr)) return { queued: false, reason: `Địa chỉ bị chặn (${blocked.get(addr)})` };

  const now = new Date();
  try {
    await EmailOutbox.create({
      priority: policy.LANES.P2,
      kind,
      to: addr,
      userId,
      subject,
      html,
      dedupeKey,
      meta,
      scheduledAfter: now,
      expiresAt: new Date(now.getTime() + policy.P2_TTL_MS),
    });
    return { queued: true };
  } catch (e) {
    if (e.code === 11000) return { queued: false, reason: 'Đã có thư cùng loại đang chờ gửi' };
    throw e;
  }
};

/**
 * Còn xếp được bao nhiêu thư P2 mà vẫn gửi kịp trong hạn 48h.
 *
 * Chống tràn hàng đợi: cron không xếp quá sức gửi của 2 ngày, phần còn lại để
 * lượt sau (người được gửi gần nhất xếp cuối — xem cohort rotation trong cronJob).
 */
const p2Budget = async () => {
  const cap = await governor.p2DailyCap();
  if (cap <= 0) return 0;
  const pending = await EmailOutbox.countDocuments({ priority: policy.LANES.P2, status: { $in: ['pending', 'sending'] } });
  return Math.max(0, cap * 2 - pending);
};

module.exports = { enqueue, p2Budget };
