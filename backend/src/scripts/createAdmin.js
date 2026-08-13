const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');

// ─── Tạo hoặc nâng quyền tài khoản admin ──────────────────────────────────────
//
// Vì sao cần script này: endpoint `register` trong authController.js chặn
// role=admin (chỉ nhận candidate | employer), nên không có cách nào tạo admin
// qua giao diện. Trước đây phải đăng ký thường rồi sửa tay `role` trong Atlas.
//
// Cách dùng:
//   node src/scripts/createAdmin.js <email> <password>
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node src/scripts/createAdmin.js
//
// Chạy trên production (từ shell của service backend trên Railway):
//   railway ssh --service backend
//   node src/scripts/createAdmin.js admin@example.com 'mat-khau'
//
// Script này AN TOÀN để chạy lại nhiều lần:
//   - Email chưa tồn tại  -> tạo user mới với role=admin
//   - Email đã tồn tại    -> nâng lên role=admin, KHÔNG đụng tới mật khẩu cũ
//     (dùng --reset-password nếu muốn đặt lại mật khẩu)
//
// KHÔNG liên quan gì tới run_seed.js — script kia gọi dropDatabase().

const SALT_ROUNDS = 10; // khớp với authController.js:56
const MIN_PASSWORD_LENGTH = 6; // khớp ràng buộc minlength của User model

const parseArgs = () => {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));

  return {
    email: positional[0] || process.env.ADMIN_EMAIL,
    password: positional[1] || process.env.ADMIN_PASSWORD,
    resetPassword: flags.includes('--reset-password'),
  };
};

const createAdmin = async () => {
  const { email, password, resetPassword } = parseArgs();

  if (!email) {
    console.error('Thiếu email.');
    console.error('Dùng: node src/scripts/createAdmin.js <email> <password>');
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error('Thiếu MONGO_URI. Đặt trong backend/.env hoặc biến môi trường.');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Đã kết nối database: ${mongoose.connection.name}`);

  try {
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing) {
      const changes = [];

      if (existing.role !== 'admin') {
        existing.role = 'admin';
        changes.push('role -> admin');
      }
      if (existing.status !== 'active') {
        existing.status = 'active';
        changes.push('status -> active');
      }
      if (existing.isDeleted) {
        existing.isDeleted = false;
        changes.push('isDeleted -> false');
      }

      if (resetPassword) {
        if (!password || password.length < MIN_PASSWORD_LENGTH) {
          console.error(`--reset-password cần mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
          process.exit(1);
        }
        existing.password = await bcrypt.hash(password, await bcrypt.genSalt(SALT_ROUNDS));
        changes.push('mật khẩu đã đặt lại');
      }

      if (changes.length === 0) {
        console.log(`Tài khoản ${normalizedEmail} đã là admin, không có gì để đổi.`);
      } else {
        await existing.save();
        console.log(`Đã cập nhật ${normalizedEmail}: ${changes.join(', ')}`);
      }

      if (!resetPassword) {
        console.log('Mật khẩu giữ nguyên. Thêm --reset-password nếu muốn đổi.');
      }
      return;
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      console.error(`Mật khẩu bắt buộc và tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(SALT_ROUNDS));

    const admin = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      isEmailSubscribed: false, // admin không cần nhận mail gợi ý việc làm
    });

    console.log(`Đã tạo admin: ${admin.email} (_id: ${admin._id})`);
  } finally {
    await mongoose.connection.close();
  }
};

createAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Lỗi: ${err.message}`);
    process.exit(1);
  });
