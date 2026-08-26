const mongoose = require('mongoose');

/**
 * Bản sao file CV lưu thẳng trong MongoDB.
 *
 * Đường lưu trữ chính là Cloudflare R2. Nhưng khi bốn biến R2_* chưa được đặt,
 * storageService cũ vẫn gọi S3Client với bucket `undefined` và ném lỗi
 * "No value provided for input HTTP label: Bucket". Lỗi này bị controller nuốt
 * thành 500 "System error preparing profile upload", nên người dùng chỉ thấy
 * import CV hỏng mà không biết vì sao — và không một hồ sơ nào trong database
 * có fileUrl.
 *
 * Collection này là đường dự phòng: chưa cấu hình R2 thì file nằm ở đây, mọi
 * tính năng (bóc tách AI, OCR, tải lại file gốc) vẫn chạy bình thường.
 *
 * Giới hạn 5MB của multer nằm dưới xa mức 16MB của một document MongoDB.
 */
const cvFileSchema = new mongoose.Schema(
  {
    // Trùng với CvProfile.fileUrl để hai đường lưu trữ dùng chung một khoá
    key: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    mimeType: { type: String, default: 'application/pdf' },
    size: { type: Number },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('CvFile', cvFileSchema);
