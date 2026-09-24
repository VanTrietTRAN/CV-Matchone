const mongoose = require('mongoose');

/**
 * Một dòng cho mỗi người đã xem một tin tuyển dụng.
 *
 * Bộ đếm tổng nằm trên chính tin (Job.viewCount…) để đọc danh sách không phải
 * đếm lại; bảng này giữ phần mà bộ đếm không trả lời được:
 *  - có bao nhiêu NGƯỜI khác nhau đã xem (không phải bao nhiêu lần bấm F5),
 *  - người đó là tài khoản đã đăng nhập hay khách vãng lai.
 *
 * `visitorKey` là danh tính của người xem: id tài khoản khi đã đăng nhập, còn
 * khách vãng lai thì là chuỗi băm của IP + User-Agent. Băm để không lưu IP thô,
 * vẫn đủ để nhận ra cùng một người trong ngày mà không cần cookie.
 */
const jobViewSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    // null = khách vãng lai (chưa đăng nhập)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    visitorKey: { type: String, required: true },
    isGuest: { type: Boolean, default: true },
    // Số lần người này xem tin (mỗi lần cách nhau ít nhất DEDUPE_WINDOW_MS)
    views: { type: Number, default: 1 },
    firstViewedAt: { type: Date, default: Date.now },
    lastViewedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Mỗi người xem chỉ có đúng một dòng cho mỗi tin — nhờ vậy đếm được số người
// xem duy nhất bằng countDocuments thay vì phải gom nhóm.
jobViewSchema.index({ jobId: 1, visitorKey: 1 }, { unique: true });

module.exports = mongoose.model('JobView', jobViewSchema);
