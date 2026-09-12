/**
 * Xoá toàn bộ tài khoản được tạo bằng luồng import (có trường `importedAt`)
 * để làm lại từ đầu.
 *
 * Vì sao cần: lần import đầu tiên tạo 297 tài khoản nhưng email gửi đồng bộ trong
 * request nên phần lớn sinh viên không nhận được mật khẩu tạm. Mật khẩu đó chỉ
 * tồn tại trong bộ nhớ lúc chạy, không lưu lại ở đâu — nên các tài khoản này
 * không ai đăng nhập được và cũng không khôi phục được. Xoá đi import lại bằng
 * luồng mới (có hàng đợi) sạch hơn là vá víu.
 *
 * An toàn:
 *   - Luôn sao lưu ra file JSON trước khi xoá (kể cả khi chạy --apply).
 *   - Chỉ đụng tài khoản có `importedAt`; tài khoản đăng ký bình thường, admin và
 *     doanh nghiệp không bị ảnh hưởng.
 *   - Dọn luôn dữ liệu liên quan để không để lại bản ghi mồ côi.
 *   - Mặc định là xem trước; phải thêm --apply mới ghi.
 *
 * Cách chạy (trong thư mục backend):
 *   node src/scripts/purgeImportedAccounts.js          # xem trước
 *   node src/scripts/purgeImportedAccounts.js --apply  # xoá thật
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '\n>>> CHẾ ĐỘ XOÁ THẬT <<<\n' : '\n>>> Xem trước, không xoá gì (thêm --apply) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Database:', mongoose.connection.name, '\n');

  const User = require('../models/User');
  const CvProfile = require('../models/CvProfile');
  const Application = require('../models/Application');
  const Notification = require('../models/Notification');
  const JobAlert = require('../models/JobAlert');

  const filter = { importedAt: { $exists: true } };
  const targets = await User.find(filter).lean();

  if (!targets.length) {
    console.log('Không có tài khoản import nào. Không cần làm gì.');
    await mongoose.connection.close();
    return;
  }

  const ids = targets.map((u) => u._id);
  const [cvs, apps, notifs, alerts] = await Promise.all([
    CvProfile.countDocuments({ userId: { $in: ids } }),
    Application.countDocuments({ candidateId: { $in: ids } }),
    Notification.countDocuments({ userId: { $in: ids } }),
    JobAlert.countDocuments({ userId: { $in: ids } }),
  ]);

  console.log(`Sẽ xoá ${targets.length} tài khoản và dữ liệu liên quan:`);
  console.log(`   Hồ sơ CV      : ${cvs}`);
  console.log(`   Đơn ứng tuyển : ${apps}`);
  console.log(`   Thông báo     : ${notifs}`);
  console.log(`   Thông báo việc: ${alerts}`);

  const keepCount = await User.countDocuments({ importedAt: { $exists: false } });
  console.log(`\nGiữ nguyên ${keepCount} tài khoản không phải import (admin, doanh nghiệp, người tự đăng ký).`);

  // Sao lưu trước — thư mục backups nằm trong .gitignore nên không lọt lên repo
  const backupDir = path.join(__dirname, '..', '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `imported-users-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ exportedAt: new Date().toISOString(), count: targets.length, users: targets }, null, 2),
    'utf8',
  );
  console.log(`\nĐã sao lưu ${targets.length} bản ghi vào:`);
  console.log(`   ${backupFile}`);
  console.log('   (thư mục backups nằm trong .gitignore, không đẩy lên repo)');

  if (!APPLY) {
    console.log('\nChưa xoá gì. Chạy lại với --apply để xoá thật.');
    await mongoose.connection.close();
    return;
  }

  const [dCv, dApp, dNotif, dAlert, dUser] = await Promise.all([
    CvProfile.deleteMany({ userId: { $in: ids } }),
    Application.deleteMany({ candidateId: { $in: ids } }),
    Notification.deleteMany({ userId: { $in: ids } }),
    JobAlert.deleteMany({ userId: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);

  console.log('\n── Đã xoá ──');
  console.log(`   Tài khoản     : ${dUser.deletedCount}`);
  console.log(`   Hồ sơ CV      : ${dCv.deletedCount}`);
  console.log(`   Đơn ứng tuyển : ${dApp.deletedCount}`);
  console.log(`   Thông báo     : ${dNotif.deletedCount}`);
  console.log(`   Thông báo việc: ${dAlert.deletedCount}`);

  const remaining = await User.countDocuments();
  const stillImported = await User.countDocuments(filter);
  console.log(`\nCòn lại ${remaining} tài khoản, trong đó ${stillImported} tài khoản import (phải là 0).`);

  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Lỗi:', err.message);
    process.exit(1);
  });
}
