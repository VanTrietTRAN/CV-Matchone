/**
 * Dọn metadata bị nối vào cuối phần mô tả của tin tuyển dụng.
 *
 * Bối cảnh: trang đăng tin từng ghép ngành nghề / hình thức / kinh nghiệm /
 * học vấn / mức lương thành chuỗi rồi nối vào cuối `description`, vì lúc đó
 * chưa dùng tới các cột tương ứng trong model. Script này đọc ngược khối chữ
 * đó, đổ vào đúng cột, rồi cắt khỏi mô tả.
 *
 * Cách chạy:
 *   node src/scripts/migrateJobMeta.js          # xem trước, KHÔNG ghi gì
 *   node src/scripts/migrateJobMeta.js --apply  # ghi thật
 *
 * Nguyên tắc an toàn:
 *   - Chỉ cắt các dòng ở CUỐI mô tả và khớp đúng tiền tố đã biết. Gặp dòng lạ
 *     là dừng, không đụng vào chữ nằm giữa bài.
 *   - Không ghi đè cột đã có giá trị.
 *   - Không đụng tới embedding: mô tả chỉ mất mấy dòng metadata ngắn, giữ
 *     vector cũ an toàn hơn là tính lại rồi mất trắng khi AI service lỗi.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Job = require('../models/Job');

const APPLY = process.argv.includes('--apply');

/* ── Bảng tra nhãn → slug ──────────────────────────────────────────────────
 * Đọc thẳng từ frontend/lib/job-categories.ts để không phải chép lại danh mục
 * lần thứ hai ở backend. Script chạy tay một lần nên đọc file là chấp nhận được.
 */
function loadTaxonomy() {
  const file = path.resolve(__dirname, '../../../frontend/lib/job-categories.ts');
  if (!fs.existsSync(file)) {
    throw new Error(`Không tìm thấy ${file}`);
  }
  const src = fs.readFileSync(file, 'utf8');

  const categories = new Map(); // nhãn -> slug
  const positions = new Map();

  // { value: 'it-software', label: 'IT — Phần mềm', positions: [
  const catRe = /value: '([a-z0-9-]+)',\s*\n\s*label: '([^']+)',\s*\n\s*positions:/g;
  for (const m of src.matchAll(catRe)) categories.set(m[2], m[1]);

  // p('backend-dev', 'Lập trình viên Backend'),
  const posRe = /^\s*p\('([a-z0-9-]+)', '([^']+)'\)/gm;
  for (const m of src.matchAll(posRe)) positions.set(m[2], m[1]);

  // EXPERIENCE_LEVELS
  const expBlock = src.match(/export const EXPERIENCE_LEVELS = \[([\s\S]*?)\]/);
  const experience = new Map();
  if (expBlock) {
    const re = /value: '([a-z]+)', label: '([^']+)'/g;
    for (const m of expBlock[1].matchAll(re)) experience.set(m[2], m[1]);
  }

  return { categories, positions, experience };
}

/**
 * Danh sách ngành cũ (8 mục) dùng trước khi có danh mục 37 ngành.
 * Nhãn cũ không còn tồn tại trong danh mục mới nên phải quy đổi tay.
 */
const LEGACY_INDUSTRY = {
  'Công nghệ thông tin': 'it-software',
  'Tài chính / Ngân hàng': 'finance-investment',
  'Y tế / Dược phẩm': 'healthcare',
  'Marketing / Truyền thông': 'marketing',
  'Giáo dục / Đào tạo': 'education',
  'Sản xuất': 'manufacturing',
  'Logistics / Vận tải': 'logistics',
  'Lĩnh vực khác': 'other',
  // Bản tiếng Anh còn cũ hơn nữa lưu thẳng slug
  technology: 'it-software',
  finance: 'finance-investment',
  healthcare: 'healthcare',
  marketing: 'marketing',
  education: 'education',
  manufacturing: 'manufacturing',
  logistics: 'logistics',
  other: 'other',
};

const WORK_TYPE = {
  'Tại văn phòng': 'onsite',
  'Linh hoạt': 'hybrid',
  'Linh hoạt (hybrid)': 'hybrid',
  'Làm từ xa': 'remote',
  onsite: 'onsite',
  hybrid: 'hybrid',
  remote: 'remote',
};

const LEGACY_EXPERIENCE = { entry: 'entry', mid: 'mid', senior: 'senior', expert: 'expert' };

/** Tiền tố của các dòng metadata, cả bản tiếng Việt lẫn bản tiếng Anh cũ. */
const PREFIXES = [
  ['Ngành nghề', 'industry'],
  ['Industry', 'industry'],
  ['Vị trí chuyên môn', 'specialization'],
  ['Hình thức', 'workType'],
  ['Work type', 'workType'],
  ['Kinh nghiệm', 'experience'],
  ['Experience', 'experience'],
  ['Học vấn', 'education'],
  ['Education', 'education'],
  ['Mức lương', 'salary'],
  ['Salary', 'salary'],
];

/**
 * Bóc khối metadata ở cuối mô tả.
 * Đi ngược từ dòng cuối; gặp dòng không khớp tiền tố nào thì dừng ngay.
 */
function extractTrailingMeta(description) {
  const lines = description.split('\n');
  const found = {};
  let cut = lines.length;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) {
      // Dòng trống xen giữa khối metadata thì bỏ qua, nhưng chỉ khi đã bóc được gì đó
      if (cut < lines.length) {
        cut = i;
        continue;
      }
      break;
    }

    const hit = PREFIXES.find((pfx) => line.startsWith(pfx[0] + ':'));
    if (!hit) break;

    // Chỉ tách ở dấu hai chấm ĐẦU TIÊN — giá trị có thể chứa dấu hai chấm khác
    // (vd: "Học vấn: Tốt nghiệp Đại học các chuyên ngành: tài chính, kế toán")
    const value = line.slice(hit[0].length + 1).trim();
    if (value && found[hit[1]] === undefined) found[hit[1]] = value;
    cut = i;
  }

  if (cut === lines.length) return null;
  return { meta: found, cleaned: lines.slice(0, cut).join('\n').trimEnd() };
}

/** "15 - 25 triệu" / "Từ 10 triệu" / "Tới 30 triệu" / "VND 15000000 – 25000000" */
function parseSalary(text) {
  if (!text || /thoả thuận|thỏa thuận/i.test(text)) return { min: null, max: null, currency: 'VND' };

  const currency = /USD|\$/i.test(text) ? 'USD' : 'VND';
  const toNumber = (numStr, unitMillion) => {
    const n = Number(String(numStr).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    return unitMillion ? Math.round(n * 1_000_000) : Math.round(n);
  };

  const isMillion = /triệu/i.test(text);
  const nums = text.match(/\d+(?:[.,]\d+)?/g) || [];

  if (/^\s*Từ/i.test(text) && nums.length >= 1) {
    return { min: toNumber(nums[0], isMillion), max: null, currency };
  }
  if (/^\s*Tới/i.test(text) && nums.length >= 1) {
    return { min: null, max: toNumber(nums[0], isMillion), currency };
  }
  if (nums.length >= 2) {
    return { min: toNumber(nums[0], isMillion), max: toNumber(nums[1], isMillion), currency };
  }
  if (nums.length === 1) {
    return { min: toNumber(nums[0], isMillion), max: null, currency };
  }
  return { min: null, max: null, currency };
}

async function main() {
  const tax = loadTaxonomy();
  console.log(
    `Danh mục nạp được: ${tax.categories.size} ngành, ${tax.positions.size} vị trí, ${tax.experience.size} mức kinh nghiệm`,
  );
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply để ghi) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const jobs = await Job.find({}).select(
    'title description industry specialization jobType experience education salary salaryMin salaryMax currency',
  );

  let touched = 0;
  const unmapped = new Set();

  for (const job of jobs) {
    const parsed = extractTrailingMeta(job.description || '');
    if (!parsed) continue;

    const { meta, cleaned } = parsed;
    const set = {};

    if (meta.industry && !job.industry) {
      const slug = tax.categories.get(meta.industry) || LEGACY_INDUSTRY[meta.industry];
      if (slug) set.industry = slug;
      else unmapped.add(`ngành "${meta.industry}"`);
    }
    if (meta.specialization && !job.specialization) {
      const slug = tax.positions.get(meta.specialization);
      if (slug) set.specialization = slug;
      else unmapped.add(`vị trí "${meta.specialization}"`);
    }
    if (meta.workType && !job.jobType) {
      const slug = WORK_TYPE[meta.workType];
      if (slug) set.jobType = slug;
      else unmapped.add(`hình thức "${meta.workType}"`);
    }
    if (meta.experience && !job.experience) {
      const slug = tax.experience.get(meta.experience) || LEGACY_EXPERIENCE[meta.experience];
      if (slug) set.experience = slug;
      else unmapped.add(`kinh nghiệm "${meta.experience}"`);
    }
    if (meta.education && !job.education) set.education = meta.education;

    if (meta.salary && job.salaryMin == null && job.salaryMax == null) {
      const { min, max, currency } = parseSalary(meta.salary);
      if (min != null) set.salaryMin = min;
      if (max != null) set.salaryMax = max;
      if (min != null || max != null) {
        set.currency = currency;
        if (!job.salary) set.salary = meta.salary;
      }
    }

    set.description = cleaned;
    touched += 1;

    const removed = (job.description.length - cleaned.length);
    console.log(`\n[${touched}] ${job.title.trim().slice(0, 70)}`);
    console.log(`    cắt ${removed} ký tự khỏi mô tả`);
    for (const [k, v] of Object.entries(set)) {
      if (k === 'description') continue;
      console.log(`    ${k.padEnd(14)} = ${JSON.stringify(v)}`);
    }

    if (APPLY) {
      // updateOne để không kích hoạt hook/validate làm đụng tới embedding
      await Job.updateOne({ _id: job._id }, { $set: set });
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Tin có metadata cần dọn : ${touched}/${jobs.length}`);
  if (unmapped.size) {
    console.log(`Không quy đổi được      : ${[...unmapped].join(', ')}`);
    console.log(`  (mô tả vẫn được cắt, chỉ riêng cột đó để trống)`);
  }
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

module.exports = { extractTrailingMeta, parseSalary, loadTaxonomy };
