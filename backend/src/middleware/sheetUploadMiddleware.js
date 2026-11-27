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
    // Đuôi file là BẮT BUỘC (MIME do trình duyệt tự khai, dễ giả). Trước đây chỉ
    // cần một trong hai nên file .txt text/plain cũng lọt vào luồng import.
    const okExt = /\.(xlsx|xls|csv)$/i.test(file.originalname || "");
    const okMime = ACCEPTED.includes(file.mimetype) || file.mimetype === "application/octet-stream";
    if (okExt && okMime) return cb(null, true);
    const err = new Error("Chỉ chấp nhận file Excel (.xlsx, .xls) hoặc .csv");
    err.status = 400;
    cb(err);
  },
});
