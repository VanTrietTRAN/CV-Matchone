const CvProfile = require('../models/CvProfile');

/**
 * CV "chính" của ứng viên: CV đánh dấu isPrimary, không có thì CV mới nhất.
 *
 * Trước đây mỗi nơi tự chọn một kiểu — trang hồ sơ và nộp đơn lấy CV mới nhất,
 * còn gợi ý việc làm lấy CV chính — nên ứng viên đặt CV chính rồi vẫn bị nộp
 * nhầm CV khác. Mọi chỗ dùng chung hàm này.
 */
const findPrimaryOrLatestCv = (userId, { select } = {}) => {
  const q = CvProfile.findOne({ userId }).sort({ isPrimary: -1, createdAt: -1 });
  return select ? q.select(select) : q;
};

module.exports = { findPrimaryOrLatestCv };
