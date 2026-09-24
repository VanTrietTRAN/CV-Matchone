const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email là bắt buộc"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId && !this.facebookId;
      },
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["candidate", "employer", "admin"],
      default: "candidate",
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    // ─── Thông tin sinh viên (tài khoản do admin import từ file Excel) ──────
    fullName: { type: String, trim: true },
    major: { type: String, trim: true },   // Ngành học
    phone: { type: String, trim: true },   // Điện thoại
    note: { type: String, trim: true },    // Ghi chú của nhà trường
    // MSSV — dựng ra email trường <MSSV>@sv1.dut.udn.vn (src/utils/schoolEmail.js)
    studentId: { type: String, trim: true, index: true },

    // Tài khoản tạo bằng import có mật khẩu ngẫu nhiên gửi qua email, nên bắt
    // đổi mật khẩu ở lần đăng nhập đầu tiên. Không đặt default để tài khoản
    // đăng ký bình thường (undefined) không bị hỏi.
    mustChangePassword: { type: Boolean },
    importedAt: { type: Date },

    // Hàng đợi email chào mừng cho tài khoản import.
    //
    // Trước đây email gửi thẳng trong request import: 297 sinh viên × ~6 giây =
    // 30 phút, trong khi proxy ngắt kết nối sau vài phút. Admin thấy trang treo
    // rồi lỗi, không biết đã tạo được bao nhiêu, còn server vẫn chạy tiếp ở dưới.
    //
    // Nay import chỉ tạo tài khoản rồi đánh dấu 'pending'; một worker nền gửi
    // thư theo nhịp có kiểm soát. Mật khẩu tạm KHÔNG lưu ở đây — worker sinh mật
    // khẩu mới ngay lúc gửi, nên database không bao giờ chứa mật khẩu dạng rõ.
    //
    // 'skipped': tới lượt gửi thì sinh viên đã tự đặt mật khẩu — không gửi mật
    // khẩu tạm nữa vì sẽ ghi đè mật khẩu họ đang dùng.
    welcomeEmailStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      index: true,
    },
    welcomeEmailAttempts: { type: Number, default: 0 },
    welcomeEmailError: { type: String },
    // Thư gửi tới đâu: email đăng nhập, email trường, hay cả hai trong cùng một
    // lá. Trống = 'personal' (mọi tài khoản import trước khi có email trường).
    welcomeEmailTo: { type: String, enum: ['personal', 'school', 'both'] },
    // Hai mốc tách riêng vì Brevo tính hạn mức theo từng người nhận: thư gửi cả
    // hai địa chỉ tốn 2 lượt, và phải biết ai đã nhận ở email trường để không gửi lại.
    welcomeEmailSentAt: { type: Date }, // lần cuối gửi thành công tới email đăng nhập
    schoolEmailSentAt: { type: Date },  // lần cuối gửi thành công tới email trường

    isEmailSubscribed: {
      type: Boolean,
      default: true,
    },
    jobMatchFrequency: {
      type: String,
      enum: ['immediately', 'daily', 'weekly'],
      default: 'daily',
    },
    minMatchScore: {
      type: Number,
      default: 70,
    },
    status: {
      type: String,
      enum: ["active", "banned"],
      default: "active",
    },

    // Doanh nghiệp PRO — chỉ admin bật/tắt (PATCH /api/admin/users/:id/pro).
    // Tin của họ được xếp lên đầu mọi danh sách việc làm và đầu kết quả tìm kiếm.
    // Cờ đặt ở User chứ không ở CompanyProfile vì nhà tuyển dụng có thể chưa mở
    // trang hồ sơ công ty bao giờ — khi đó CompanyProfile chưa tồn tại.
    isPro: { type: Boolean, default: false },
    proSince: { type: Date },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    // Doanh nghiệp: số hồ sơ tối đa đưa vào mỗi email tổng hợp lúc 15h.
    // 0 nghĩa là không giới hạn. Ngưỡng điểm dùng chung trường minMatchScore,
    // tần suất dùng chung jobMatchFrequency với phía ứng viên.
    employerDigestLimit: { type: Number, default: 0 },

    // Nhắc hạn tin tuyển dụng. Không đặt default để tài khoản cũ (undefined) vẫn
    // được nhắc — chỗ kiểm tra chỉ bỏ qua khi === false.
    jobExpiryReminder: { type: Boolean },

    // Đặt lại mật khẩu bằng mã 6 số (lưu bản băm, xem src/utils/otp.js)
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date },
    resetPasswordAttempts: { type: Number, default: 0 },

    // Xác thực email khi đăng ký lần đầu.
    // KHÔNG đặt default: tài khoản tạo trước tính năng này không có trường
    // emailVerified nên là undefined — chỗ kiểm tra chỉ chặn khi === false, tức
    // người dùng cũ vẫn đăng nhập bình thường.
    emailVerified: { type: Boolean },
    verificationCode: { type: String },
    verificationCodeExpire: { type: Date },
    verificationAttempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
