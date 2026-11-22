const User = require('../models/User');
const Notification = require('../models/Notification');
const SystemBroadcast = require('../models/SystemBroadcast');
const outbox = require('./mail/outbox');
const governor = require('./mail/governor');

/**
 * Phát thông báo hệ thống ở nền, không chặn request của admin.
 *
 * Thông báo trong ứng dụng tới MỌI tài khoản đang dùng. Còn email thì KHÔNG bắn
 * thẳng nữa (trước đây: 50 thư song song mỗi 300ms, tới toàn bộ người dùng) —
 * mà xếp vào hàng đợi làn P2:
 *   - chỉ người đăng nhập trong 14–30 ngày gần nhất (gửi cho người đã bỏ đi là
 *     cách nhanh nhất để bị báo spam);
 *   - không quá sức gửi của 48 giờ, người hoạt động gần nhất được xếp trước;
 *   - worker gửi theo nhịp P2 trong khung 09:00–17:00, quá 48h thì tự huỷ.
 */
const processBroadcastAsync = async (broadcastId) => {
  console.log(`[BroadcastWorker] Bắt đầu phát thông báo ngầm ID: ${broadcastId}`);
  try {
    const broadcast = await SystemBroadcast.findById(broadcastId);
    if (!broadcast) return;

    // Tài khoản đã xoá mềm hoặc đang bị khoá không được nhận gì cả.
    //
    // Cố ý KHÔNG lọc theo isEmailSubscribed ở thông báo trong ứng dụng: đây là
    // thông báo vận hành (bảo trì, đổi chính sách). Email vẫn qua danh sách chặn
    // nên người đã bấm huỷ nhận thì không nhận thư.
    const userFilter = { isDeleted: { $ne: true }, status: { $ne: 'banned' } };
    if (broadcast.targetGroup === 'candidates') {
      userFilter.role = 'candidate';
    } else if (broadcast.targetGroup === 'employers') {
      userFilter.role = 'employer';
    }

    const totalTargets = await User.countDocuments(userFilter);
    broadcast.stats.totalTargets = totalTargets;
    await broadcast.save();

    if (totalTargets === 0) {
      broadcast.status = 'completed';
      broadcast.completedAt = new Date();
      await broadcast.save();
      return;
    }

    const mail = broadcast.sendEmail
      ? {
          left: await outbox.p2Budget(),
          activeSince: new Date(Date.now() - (await governor.activeWindowDays()) * 24 * 60 * 60 * 1000),
        }
      : null;

    let sentCount = 0;
    let failCount = 0;
    let emailQueued = 0;
    let emailSkipped = 0;
    const CHUNK_SIZE = 50;

    // Người hoạt động gần nhất trước: ngân sách email không đủ thì họ được ưu tiên
    const cursor = User.find(userFilter)
      .select('_id email fullName lastActiveAt')
      .sort({ lastActiveAt: -1, _id: 1 })
      .cursor();
    let chunk = [];

    const flush = async () => {
      const result = await processChunk(chunk, broadcast, mail);
      sentCount += result.sent;
      failCount += result.failed;
      emailQueued += result.queued;
      emailSkipped += result.skipped;
      chunk = [];
      await SystemBroadcast.findByIdAndUpdate(broadcastId, {
        'stats.sentCount': sentCount,
        'stats.failCount': failCount,
        'stats.emailQueued': emailQueued,
        'stats.emailSkipped': emailSkipped,
      });
    };

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      chunk.push(doc);
      if (chunk.length >= CHUNK_SIZE) await flush();
    }
    if (chunk.length > 0) await flush();

    broadcast.status = 'completed';
    broadcast.completedAt = new Date();
    broadcast.stats.sentCount = sentCount;
    broadcast.stats.failCount = failCount;
    broadcast.stats.emailQueued = emailQueued;
    broadcast.stats.emailSkipped = emailSkipped;
    await broadcast.save();

    console.log(
      `[BroadcastWorker] ✅ Hoàn tất (tới ${sentCount} tài khoản, lỗi ${failCount}` +
        (broadcast.sendEmail ? `, xếp ${emailQueued} email, bỏ qua ${emailSkipped} email` : '') +
        ')',
    );
  } catch (error) {
    console.error(`[BroadcastWorker] ❌ Lỗi khi phát thông báo ID ${broadcastId}:`, error.message);
    await SystemBroadcast.findByIdAndUpdate(broadcastId, {
      status: 'failed',
    });
  }
};

// Giữ nguyên bố cục thư cũ; chỉ khác là nay đi qua hàng đợi P2
const renderBroadcastHtml = (broadcast) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; rounded: 8px;">
    <h2 style="color: #6d28d9;">📢 Thông báo từ Hệ thống CVMatchOne</h2>
    <p style="font-size: 16px; font-weight: bold; color: #111;">${broadcast.title}</p>
    <div style="background-color: #f5f3ff; padding: 15px; border-left: 4px solid #7c3aed; margin: 20px 0; color: #333; line-height: 1.6;">
      ${broadcast.message.replace(/\n/g, '<br/>')}
    </div>
    <p style="font-size: 13px; color: #666;">Cảm ơn bạn đã đồng hành cùng CVMatchOne!</p>
  </div>
`;

/** Một nhóm tối đa 50 người: thông báo trong ứng dụng ghi một lượt, email xếp hàng. */
async function processChunk(users, broadcast, mail) {
  let sent = 0;
  let failed = 0;
  let queued = 0;
  let skipped = 0;

  if (broadcast.sendInApp) {
    try {
      const notifications = users.map((u) => ({
        userId: u._id,
        title: broadcast.title,
        message: broadcast.message,
        type: 'system',
        isRead: false,
      }));
      // insertMany bỏ qua lặng lẽ các bản ghi không hợp lệ — đếm theo số thật sự ghi được
      const inserted = await Notification.insertMany(notifications, { ordered: false });
      sent += inserted.length;
      failed += users.length - inserted.length;
    } catch (err) {
      console.error('[BroadcastWorker] In-app notification bulk insert error:', err.message);
      failed += users.length;
    }
  }

  if (mail) {
    const html = renderBroadcastHtml(broadcast);
    for (const user of users) {
      const active = user.lastActiveAt && new Date(user.lastActiveAt) >= mail.activeSince;
      if (!active || mail.left <= 0) {
        skipped += 1;
        continue;
      }
      try {
        const r = await outbox.enqueue({
          kind: 'broadcast',
          to: user.email,
          userId: user._id,
          subject: `[CVMatchOne] ${broadcast.title}`,
          html,
          dedupeKey: `broadcast:${broadcast._id}:${user._id}`,
        });
        if (r.queued) {
          queued += 1;
          mail.left -= 1;
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }
    // Chỉ gửi email (không có thông báo trong ứng dụng): "tới được" = đã xếp hàng
    if (!broadcast.sendInApp) sent += queued;
  } else if (!broadcast.sendInApp) {
    sent += users.length;
  }

  return { sent, failed, queued, skipped };
}

module.exports = { processBroadcastAsync };
