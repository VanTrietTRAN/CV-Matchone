/**
 * Dọn hậu quả của lần import đầu tiên, trước khi có hàng đợi email.
 *
 * Bối cảnh: 297 tài khoản sinh viên được tạo bằng luồng import cũ — email gửi
 * đồng bộ ngay trong request, mỗi dòng mất ~6 giây. Proxy ngắt kết nối từ sớm
 * nên phần lớn sinh viên không nhận được thư, mà mật khẩu tạm thì chỉ tồn tại
 * trong bộ nhớ lúc đó. Kết quả: có tài khoản nhưng không ai đăng nhập được.
 *
 * Script này xếp các tài khoản đó vào hàng đợi để worker gửi lại. Worker sinh
 * mật khẩu MỚI lúc gửi và ghi đè mật khẩu cũ, nên sinh viên nhận được thư là
 * đăng nhập được ngay.
 *
 * Ai đã nhận thư thành công trước đó cũng sẽ nhận thư mới với mật khẩu mới —
 * không tránh được, vì không có cách nào biết ai đã nhận. Thà gửi lại còn hơn
 * để sinh viên kẹt ngoài hệ thống.
 *
 * Cách chạy (trong thư mục backend):
 *   node src/scripts/fixImportedAccounts.js          # xem trước
 *   node src/scripts/fixImportedAccounts.js --apply  # ghi thật
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Database:', mongoose.connection.name, '\n');

  // Tài khoản import nhưng chưa có trạng thái hàng đợi — tức tạo bằng luồng cũ
  const filter = {
    importedAt: { $exists: true },
    welcomeEmailStatus: { $exists: false },
    isDeleted: { $ne: true },
  };

  const total = await User.countDocuments(filter);
  if (total === 0) {
    console.log('Không có tài khoản nào cần xếp lại hàng đợi.');
    await mongoose.connection.close();
    return;
  }

  const sample = await User.find(filter).select('email fullName importedAt').limit(5).lean();
  console.log(`Tìm thấy ${total} tài khoản tạo bằng luồng import cũ. Ví dụ:`);
  sample.forEach((u) => console.log(`   ${u.email} · ${u.fullName}`));
  if (total > 5) console.log(`   ... và ${total - 5} tài khoản nữa`);

  const { DAILY_CAP } = require('../services/welcomeEmailWorker');
  console.log(`\nWorker gửi tối đa ${DAILY_CAP} thư/ngày (giới hạn của gói Brevo).`);
  console.log(`Ước tính cần ${Math.ceil(total / DAILY_CAP)} ngày để gửi hết.`);

  if (!APPLY) {
    console.log('\nChưa ghi gì. Chạy lại với --apply để xếp vào hàng đợi.');
    await mongoose.connection.close();
    return;
  }

  const r = await User.updateMany(filter, {
    $set: { welcomeEmailStatus: 'pending', welcomeEmailAttempts: 0 },
    $unset: { welcomeEmailError: '' },
  });

  console.log(`\nĐã xếp ${r.modifiedCount} tài khoản vào hàng đợi.`);
  console.log('Worker sẽ tự gửi dần; theo dõi ở Quản trị → Import sinh viên.');

  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Lỗi:', err.message);
    process.exit(1);
  });
}
