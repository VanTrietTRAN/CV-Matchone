/**
 * Đồng bộ dữ liệu lương của các tin tuyển dụng đã có.
 *
 * Bối cảnh: ô nhập lương và import Excel từng đọc số tiền theo kiểu Mỹ, nên
 * "176.000" (176 nghìn yên) bị lưu thành 176 và "189.400" thành 189.4. Chuỗi
 * `salary` mà trang chi tiết hiển thị cũng lệch với thẻ tin tính từ
 * salaryMin / salaryMax: có tin để rỗng nên hiện "Thoả thuận", có tin ghi
 * "8 triệu - 13 triệu" thay vì "8 - 13 triệu".
 *
 * Với mỗi tin, script:
 *   1. Chuẩn hoá mã tiền tệ (thiếu hoặc viết lạ -> VND, JPY...).
 *   2. Lương đồng / yên dưới 1.000 -> nhân 1.000 (xem restoreThousands).
 *   3. Tin chỉ có chuỗi lương mà chưa có số -> bóc số từ chuỗi.
 *   4. Dựng lại chuỗi `salary` từ số, đúng cách giao diện đang hiển thị.
 *
 * Cách chạy:
 *   node src/scripts/syncSalary.js          # xem trước, KHÔNG ghi gì
 *   node src/scripts/syncSalary.js --apply  # ghi thật
 *
 * Nên chạy `node src/scripts/dbBackup.js` trước khi --apply.
 * Chạy lại nhiều lần không sao: lần sau không còn gì để đổi.
 * Không đụng embedding — lương không nằm trong văn bản tạo vector.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('../models/Job');
const {
  parseSalaryRange,
  normalizeCurrency,
  restoreThousands,
  formatSalary,
} = require('../utils/salary');

const APPLY = process.argv.includes('--apply');

const hasAmount = (v) => typeof v === 'number' && v > 0;

/** Những gì cần đổi cho một tin; rỗng nghĩa là tin đã đồng bộ. */
function planFor(job) {
  const set = {};
  let min = hasAmount(job.salaryMin) ? job.salaryMin : null;
  let max = hasAmount(job.salaryMax) ? job.salaryMax : null;
  let currency = normalizeCurrency(job.currency);

  if (min == null && max == null && job.salary) {
    const parsed = parseSalaryRange(job.salary);
    min = parsed.min;
    max = parsed.max;
    // Ký hiệu tiền trong chuỗi ("$500 - $800", "176.000 yên") thắng giá trị
    // `currency` mặc định "VND" của tin: trước đây bị quy thành 500–800 NGHÌN đồng.
    if (parsed.currency && parsed.currency !== 'VND') currency = parsed.currency;
    else currency = currency || parsed.currency;
  }
  currency = currency || 'VND';

  min = restoreThousands(min, currency);
  max = restoreThousands(max, currency);

  if (currency !== job.currency) set.currency = currency;
  if (min != null && min !== job.salaryMin) set.salaryMin = min;
  if (max != null && max !== job.salaryMax) set.salaryMax = max;

  if (hasAmount(min) || hasAmount(max)) {
    const text = formatSalary(min, max, currency);
    if (text !== job.salary) set.salary = text;
  }
  return set;
}

async function main() {
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply để ghi) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  // lean(): đọc đúng giá trị đang nằm trong DB, không để mongoose điền mặc định
  const jobs = await Job.find({})
    .select('title salary salaryMin salaryMax currency isDeleted')
    .lean();

  let touched = 0;
  const counts = { currency: 0, salaryMin: 0, salaryMax: 0, salary: 0 };

  for (const job of jobs) {
    const set = planFor(job);
    if (!Object.keys(set).length) continue;

    touched += 1;
    const tag = job.isDeleted ? ' (đã xoá)' : '';
    // Array.from để không cắt đôi ký tự ngoài BMP (tiêu đề dùng chữ in đậm Unicode)
    const title = Array.from(String(job.title).trim()).slice(0, 70).join('');
    console.log(`[${touched}] ${title}${tag}`);
    for (const [k, v] of Object.entries(set)) {
      counts[k] += 1;
      console.log(`    ${k.padEnd(10)} ${JSON.stringify(job[k] ?? null)} -> ${JSON.stringify(v)}`);
    }

    if (APPLY) {
      // updateOne để không chạy validate / hook nào đụng tới embedding
      await Job.updateOne({ _id: job._id }, { $set: set });
    }
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Tin cần đồng bộ : ${touched}/${jobs.length}`);
  console.log(
    `Theo trường     : tiền tệ ${counts.currency}, lương tối thiểu ${counts.salaryMin}, ` +
      `lương tối đa ${counts.salaryMax}, chuỗi hiển thị ${counts.salary}`,
  );
  console.log(APPLY ? 'Đã ghi vào database.' : 'Chưa ghi gì. Chạy lại với --apply để áp dụng.');

  await mongoose.connection.close();
}

// Chỉ chạy khi gọi trực tiếp; require vào để test thì không đụng database.
if (require.main === module) {
  main().catch((err) => {
    console.error('Lỗi:', err.message);
    process.exit(1);
  });
}

module.exports = { planFor };
