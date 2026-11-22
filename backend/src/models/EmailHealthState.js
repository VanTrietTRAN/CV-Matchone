const mongoose = require('mongoose');

/**
 * Trạng thái dùng chung của đường gửi mail — MỘT bản ghi duy nhất (_id 'singleton').
 *
 * Nằm trong database chứ không trong bộ nhớ để mọi worker (và mọi bản sao của
 * backend nếu sau này chạy nhiều instance) đọc cùng một trạng thái trước khi gửi,
 * và để breaker đang NGẮT không tự mở lại chỉ vì server khởi động lại.
 *
 * Bộ đếm tăng bằng một lệnh update có điều kiện (xem mail/governor.js), nên hai
 * lượt gửi cùng lúc không thể cùng lọt qua trần.
 */
const pausedBatchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true },
    reason: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const emailHealthStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },

    // CLOSED | THROTTLED | OPEN | HALF_OPEN
    breakerState: { type: String, default: 'CLOSED' },
    resumeAt: { type: Date }, // OPEN → HALF_OPEN, THROTTLED → CLOSED
    halfOpenSince: { type: Date },
    probeSent: { type: Number, default: 0 },
    lastTripReason: { type: String },
    lastTripAt: { type: Date },
    smtpErrorStreak: { type: Number, default: 0 },

    // Bộ đếm theo ngày (giờ Việt Nam). Brevo tính theo người nhận, nên thư gửi
    // hai địa chỉ tính 2.
    quotaDate: { type: String }, // YYYY-MM-DD
    p0SentToday: { type: Number, default: 0 },
    p1SentToday: { type: Number, default: 0 },
    p2SentToday: { type: Number, default: 0 },
    totalSentToday: { type: Number, default: 0 },

    // Bộ đếm theo giờ và nhịp gửi kế tiếp của P1/P2
    hourKey: { type: String }, // YYYY-MM-DDTHH
    p1SentThisHour: { type: Number, default: 0 },
    p2SentThisHour: { type: Number, default: 0 },
    p1NextAt: { type: Date },
    p2NextAt: { type: Date },

    // Lộ trình tăng tải 4 tuần
    warmupStage: { type: Number, default: 1 },
    warmupStageSince: { type: Date, default: Date.now },

    // Lô import bị dừng vì sinh hard bounce — worker thư mời bỏ qua các lô này
    pausedBatches: { type: [pausedBatchSchema], default: [] },
  },
  { timestamps: true, collection: 'email_health_state' },
);

module.exports = mongoose.model('EmailHealthState', emailHealthStateSchema);
