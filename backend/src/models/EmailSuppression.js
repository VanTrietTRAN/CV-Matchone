const mongoose = require('mongoose');

/**
 * Danh sách địa chỉ không gửi thư mời (P1) và thư gợi ý (P2) nữa.
 *
 * Gửi tiếp tới địa chỉ đã hard bounce hay đã bấm "Báo cáo spam" là cách nhanh
 * nhất để kéo uy tín tên miền xuống. Mọi lệnh xếp hàng P1/P2 và mọi lượt gửi
 * P1/P2 đều lọc qua bảng này. Thư P0 (mã đặt lại mật khẩu do chính người dùng
 * yêu cầu) không bị chặn ở đây.
 */
const emailSuppressionSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason: {
      type: String,
      enum: ['hard_bounce', 'spam', 'unsubscribed', 'blocked', 'invalid', 'manual'],
      required: true,
    },
    source: { type: String }, // webhook | import | unsubscribe_link | admin
    detail: { type: String },
  },
  { timestamps: true, collection: 'email_suppression_list' },
);

module.exports = mongoose.model('EmailSuppression', emailSuppressionSchema);
