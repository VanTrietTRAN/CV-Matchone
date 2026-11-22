const mongoose = require('mongoose');

/**
 * Nhật ký sự kiện gửi mail: lượt gửi của chính hệ thống ('sent', 'smtp_error')
 * và sự kiện Brevo đẩy về qua webhook ('delivered', 'hard_bounce', 'spam', ...).
 *
 * Circuit Breaker đếm trên bảng này (vd. số hard bounce trong 24h, tỉ lệ
 * deferred trong 1 giờ), nên chỉ cần giữ ít ngày — TTL 30 ngày tự dọn.
 */
const emailEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    lane: { type: Number }, // 0 | 1 | 2, nếu biết
    kind: { type: String }, // password_reset, welcome, job_match, ...
    messageId: { type: String, index: true },
    importBatchId: { type: String, index: true },
    code: { type: Number }, // mã SMTP với smtp_error
    reason: { type: String },
    source: { type: String, enum: ['smtp', 'webhook', 'system'], default: 'system' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'email_events', versionKey: false },
);

emailEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
emailEventSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('EmailEvent', emailEventSchema);
