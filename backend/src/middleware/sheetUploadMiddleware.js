const multer = require("multer");

/**
 * Nhận file Excel/CSV cho các luồng import hàng loạt.
 *
 * Tách riêng khỏi uploadMiddleware (chỉ nhận PDF cho CV): dùng chung thì phải nới
 * fileFilter cho cả hai định dạng, và một lỗi cấu hình sẽ cho phép upload nhầm
 * loại file vào cả hai đường.
 */
const ACCEPTED = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
  "application/csv",
  "text/plain", // một số trình duyệt gửi .csv dưới dạng này
];

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = ACCEPTED.includes(file.mimetype);
    const okExt = /\.(xlsx|xls|csv)$/i.test(file.originalname || "");
    if (okMime || okExt) return cb(null, true);
    cb(new Error("Chỉ chấp nhận file Excel (.xlsx, .xls) hoặc .csv"));
  },
});
