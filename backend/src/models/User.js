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
    studentClass: { type: String, trim: true },   // Lớp
    studentCode: { type: String, trim: true },    // MSSV
    major: { type: String, trim: true },          // Ngành học
    specialization: { type: String, trim: true }, // Chuyên ngành
    expectedGraduation: { type: String, trim: true },

    // Tài khoản tạo bằng import có mật khẩu ngẫu nhiên gửi qua email, nên bắt
    // đổi mật khẩu ở lần đăng nhập đầu tiên. Không đặt default để tài khoản
    // đăng ký bình thường (undefined) không bị hỏi.
    mustChangePassword: { type: Boolean },
    importedAt: { type: Date },

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
