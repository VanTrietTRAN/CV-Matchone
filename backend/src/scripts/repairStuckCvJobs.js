/**
 * Dọn các hồ sơ CV bị kẹt ở trạng thái "failed" vì lỗi cũ của worker.
 *
 * Bối cảnh: cronWorker cũ ném "No fileUrl present on the CV profile" với mọi hồ
 * sơ nhập tay (không có file PDF). Chỉ cần admin bấm "Thử lại AI" trên một hồ sơ
 * kiểu đó là nó đốt hết 3 lượt thử rồi bị đánh dấu failed vĩnh viễn — dù nội
 * dung hồ sơ hoàn toàn bình thường.
 *
 * Worker nay đã biết nhúng thẳng từ các trường đã nhập, nên các hồ sơ bị kẹt chỉ
 * cần được đặt lại trạng thái:
 *   - đã có vector  -> ready (không cần gọi AI lần nữa)
 *   - chưa có vector nhưng có nội dung -> queued để worker nhúng lại
 *   - không có nội dung -> ready, vector rỗng là đúng
 *
 * Cách chạy (trong thư mục backend):
 *   node src/scripts/repairStuckCvJobs.js          # xem trước, không ghi gì
 *   node src/scripts/repairStuckCvJobs.js --apply  # ghi thật
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CvProfile = require('../models/CvProfile');
const { buildCvEmbeddingText, isEmbeddable } = require('../utils/cvEmbeddingText');

const APPLY = process.argv.includes('--apply');

/** Lỗi do chính bug cũ sinh ra, không phải lỗi thật của file PDF. */
const STALE_ERROR = /No fileUrl present on the CV profile/i;

async function main() {
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Database:', mongoose.connection.name, '\n');

  const stuck = await CvProfile.find({
    processingStatus: 'failed',
    processingError: { $regex: STALE_ERROR },
  });

  if (stuck.length === 0) {
    console.log('Không có hồ sơ nào bị kẹt vì lỗi này.');
    await mongoose.connection.close();
    return;
  }

  const counts = { ready: 0, queued: 0 };

  for (const cv of stuck) {
    const label = `${cv.fullName || '(chưa đặt tên)'} · ${String(cv._id).slice(-6)}`;
    const hasVector = cv.embedding?.length > 0;
    const hasContent = isEmbeddable(buildCvEmbeddingText(cv));

    // Chỉ hồ sơ vừa thiếu vector vừa có nội dung mới cần gọi AI lại
    const target = !hasVector && hasContent ? 'queued' : 'ready';
    counts[target] += 1;

    const why = hasVector
      ? 'đã có vector sẵn'
      : hasContent
        ? 'có nội dung nhưng thiếu vector'
        : 'hồ sơ trống, không có gì để nhúng';
    console.log(`   ${APPLY ? '→' : 'sẽ'} ${target.padEnd(6)} ${label} — ${why}`);

    if (!APPLY) continue;

    cv.processingStatus = target;
    cv.processingError = null;
    cv.attempts = 0;
    await cv.save();
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Hồ sơ bị kẹt tìm thấy : ${stuck.length}`);
  console.log(`${APPLY ? 'Đã đặt' : 'Sẽ đặt'} về ready       : ${counts.ready}`);
  console.log(`${APPLY ? 'Đã xếp' : 'Sẽ xếp'} hàng nhúng lại : ${counts.queued}`);
  console.log(APPLY ? 'Đã ghi vào database.' : 'Chưa ghi gì. Chạy lại với --apply để áp dụng.');

  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Lỗi:', err.message);
    process.exit(1);
  });
}
