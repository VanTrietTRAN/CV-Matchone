const mongoose = require('mongoose');

/**
 * Hàng đợi thư làn P2 (gợi ý việc làm, thông báo theo từ khoá, tổng hợp hồ sơ,
 * nhắc hạn tin, thông báo hệ thống).
 *
 * Trước đây cron gửi thẳng trong vòng lặp duyệt người dùng: số người vượt 300
 * là hàng đợi tràn sang nhiều ngày liền, chạy kịch trần và chiếm luôn suất của
 * thư đổi mật khẩu. Nay cron chỉ XẾP HÀNG; worker (mail/outboxWorker.js) gửi
 * theo nhịp và trần của làn P2, còn thư quá 48 giờ chưa tới lượt thì tự huỷ
 * ('expired') thay vì dồn cục sang tuần sau.
 *
 * Thư mời (P1) không nằm ở đây: mật khẩu tạm phải sinh ngay lúc gửi, nên hàng
 * đợi của nó vẫn là trạng thái welcomeEmailStatus trên User.
 */
const emailOutboxSchema = new mongoose.Schema(
  {
    priority: { type: Number, required: true, default: 2 },
    kind: {
      type: String,
      enum: ['job_match', 'job_alert', 'employer_digest', 'job_expiry', 'broadcast'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'expired', 'suppressed', 'failed'],
      default: 'pending',
      index: true,
    },
    to: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subject: { type: String, required: true },
    html: { type: String, required: true },

    // Chống xếp trùng: cùng khoá thì chỉ một thư 'pending' tại một thời điểm
    dedupeKey: { type: String },
    // Việc cần làm sau khi gửi xong (vd. ghi mốc lastDigestEmailAt)
    meta: { type: mongoose.Schema.Types.Mixed },

    scheduledAfter: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lockedAt: { type: Date },
    sentAt: { type: Date },
    messageId: { type: String },
    error: { type: String },
  },
  { timestamps: true, collection: 'email_outbox' },
);

emailOutboxSchema.index({ status: 1, priority: 1, createdAt: 1 });
emailOutboxSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { status: 'pending', dedupeKey: { $type: 'string' } } },
);
// Giữ lịch sử 30 ngày để admin tra cứu, sau đó tự dọn
emailOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('EmailOutbox', emailOutboxSchema);
