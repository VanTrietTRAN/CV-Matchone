/**
 * Chuẩn hoá chữ "font hoa mỹ" trong tin tuyển dụng và tên công ty đã có.
 *
 * Bối cảnh: doanh nghiệp dán tiêu đề chép từ mạng xã hội, thật ra là kí tự toán
 * học Unicode ("𝑵𝒉𝒂̂𝒏 𝒗𝒊𝒆̂𝒏" thay cho "Nhân viên"). Model nay chuẩn hoá NFKC
 * khi lưu (utils/normalizeText), script này sửa dữ liệu cũ:
 *   1. Job.title, Job.location, CompanyProfile.companyName -> dạng NFKC.
 *   2. Tin đổi tiêu đề -> tính lại embedding (vector cũ tính từ chuỗi vô nghĩa).
 *      Tính lại thất bại thì giữ vector cũ, không xoá.
 *
 * Cách chạy:
 *   node src/scripts/normalizeJobText.js          # xem trước, KHÔNG ghi gì
 *   node src/scripts/normalizeJobText.js --apply  # ghi thật
 *
 * Nên chạy `node src/scripts/dbBackup.js` trước khi --apply.
 * Chạy lại nhiều lần không sao: lần sau không còn gì để đổi.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('../models/Job');
const CompanyProfile = require('../models/CompanyProfile');

const APPLY = process.argv.includes('--apply');

const nfkc = (v) => (typeof v === 'string' ? v.normalize('NFKC') : v);

/** Các trường cần đổi của một bản ghi; rỗng nghĩa là đã chuẩn. */
const planFor = (doc, fields) => {
  const set = {};
  for (const f of fields) {
    if (typeof doc[f] === 'string' && nfkc(doc[f]) !== doc[f]) set[f] = nfkc(doc[f]);
  }
  return set;
};

const short = (s) => Array.from(String(s ?? '')).slice(0, 70).join('');

async function main() {
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply để ghi) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  // Nạp muộn: chỉ cần khi ghi thật, và kéo theo cấu hình AI service
  const { computeJobEmbedding } = APPLY ? require('../controllers/jobController') : {};

  const jobs = await Job.find({}).select('title location description requirements isDeleted').lean();
  let jobCount = 0;
  let reembedOk = 0;
  let reembedFail = 0;

  for (const job of jobs) {
    const set = planFor(job, ['title', 'location']);
    if (!Object.keys(set).length) continue;

    jobCount += 1;
    console.log(`[Tin ${jobCount}]${job.isDeleted ? ' (đã xoá)' : ''}`);
    for (const [k, v] of Object.entries(set)) {
      console.log(`    ${k.padEnd(9)} ${short(job[k])}\n    ${''.padEnd(9)} -> ${short(v)}`);
    }

    if (!APPLY) continue;

    if (set.title && !job.isDeleted) {
      const emb = await computeJobEmbedding(set.title, job.description, job.requirements);
      if (emb?.length) {
        set.embedding = emb;
        reembedOk += 1;
      } else {
        reembedFail += 1;
        console.warn('    ! Không tính lại được embedding, giữ vector cũ.');
      }
    }
    // updateOne: không chạy validate/hook của document, chỉ ghi đúng các trường đổi
    await Job.updateOne({ _id: job._id }, { $set: set });
  }

  const companies = await CompanyProfile.find({}).select('companyName').lean();
  let companyCount = 0;
  for (const c of companies) {
    const set = planFor(c, ['companyName']);
    if (!Object.keys(set).length) continue;
    companyCount += 1;
    console.log(`[Công ty ${companyCount}] ${short(c.companyName)}\n    -> ${short(set.companyName)}`);
    if (APPLY) await CompanyProfile.updateOne({ _id: c._id }, { $set: set });
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Tin cần chuẩn hoá     : ${jobCount}/${jobs.length}`);
  console.log(`Công ty cần chuẩn hoá : ${companyCount}/${companies.length}`);
  if (APPLY) {
    console.log(`Embedding tính lại   : ${reembedOk} thành công, ${reembedFail} giữ vector cũ`);
    console.log('Đã ghi vào database.');
  } else {
    console.log('Chưa ghi gì. Chạy lại với --apply để áp dụng.');
  }

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
