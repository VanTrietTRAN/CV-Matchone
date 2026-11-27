/**
 * Dọn đơn ứng tuyển trùng (cùng ứng viên, cùng tin) để tạo được chỉ mục unique
 * { jobId, candidateId } của model Application.
 *
 * Chỉ mục này chặn race condition nộp đơn song song. Nếu database đã có bản
 * trùng từ trước, MongoDB từ chối tạo chỉ mục và việc chặn trùng không có hiệu lực.
 *
 * Giữ lại MỘT đơn mỗi nhóm, ưu tiên đơn đã được xử lý xa nhất
 * (accepted > interview > reviewed > rejected > pending), cùng mức thì giữ đơn
 * nộp sớm nhất. Thông báo trỏ tới đơn bị xoá được chuyển sang đơn được giữ.
 *
 * Chạy:  node src/scripts/dedupeApplications.js            (xem trước, không ghi gì)
 *        node src/scripts/dedupeApplications.js --apply    (xoá thật, có sao lưu)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const RANK = { accepted: 5, interview: 4, reviewed: 3, rejected: 2, pending: 1 };

async function main() {
  console.log(APPLY ? '\n>>> CHẾ ĐỘ XOÁ THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply để xoá) <<<\n');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Database:', mongoose.connection.name);

  const apps = mongoose.connection.db.collection('applications');
  const groups = await apps
    .aggregate([
      { $group: { _id: { jobId: '$jobId', candidateId: '$candidateId' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();

  const total = await apps.countDocuments();
  console.log(`Tổng đơn: ${total}. Nhóm trùng: ${groups.length}.`);
  if (!groups.length) {
    console.log('Không có đơn trùng — chỉ mục unique tạo được bình thường.');
    await mongoose.disconnect();
    return;
  }

  const plan = [];
  for (const g of groups) {
    const docs = await apps.find({ _id: { $in: g.ids } }).toArray();
    docs.sort(
      (a, b) =>
        (RANK[b.status] || 0) - (RANK[a.status] || 0) || new Date(a.appliedAt) - new Date(b.appliedAt),
    );
    const [keep, ...drop] = docs;
    plan.push({ keep, drop });
    console.log(
      `  job ${g._id.jobId} · ứng viên ${g._id.candidateId}: giữ ${keep._id} (${keep.status}), xoá ${drop
        .map((d) => `${d._id} (${d.status})`)
        .join(', ')}`,
    );
  }
  const dropIds = plan.flatMap((p) => p.drop.map((d) => d._id));
  console.log(`\nSẽ xoá ${dropIds.length} đơn trùng.`);

  if (!APPLY) {
    console.log('Chưa xoá gì. Chạy lại với --apply để xoá.');
    await mongoose.disconnect();
    return;
  }

  // Sao lưu trước khi xoá — thư mục backups nằm trong .gitignore
  const dir = path.join(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `duplicate-applications-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.flatMap((p) => p.drop), null, 2), 'utf8');
  console.log(`Đã sao lưu ${dropIds.length} đơn vào ${file}`);

  const notifs = mongoose.connection.db.collection('notifications');
  for (const { keep, drop } of plan) {
    await notifs.updateMany({ applicationId: { $in: drop.map((d) => d._id) } }, { $set: { applicationId: keep._id } });
  }
  const r = await apps.deleteMany({ _id: { $in: dropIds } });
  console.log(`Đã xoá ${r.deletedCount} đơn trùng.`);

  await apps.createIndex({ jobId: 1, candidateId: 1 }, { unique: true });
  console.log('Đã tạo chỉ mục unique { jobId, candidateId }.');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Lỗi:', e.message);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => {});
});
