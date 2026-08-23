/**
 * Tạo lại embedding cho các CV đang thiếu vector.
 *
 * Vì sao cần: cvController từng gọi `aiService.getEmbedding` mà quên import
 * `aiService`, nên mọi lời gọi ném ReferenceError rồi bị try/catch nuốt thành
 * warning. Hồ sơ vẫn được lưu với processingStatus = 'ready' nhưng embedding
 * rỗng → mọi điểm phù hợp đều 0 và không ai biết.
 *
 * Sau khi vá import, các CV cũ vẫn trống nên phải chạy script này một lần.
 * Đồng thời cập nhật lại điểm của những đơn ứng tuyển liên quan.
 *
 * Cách chạy (AI service phải đang chạy và AI_SERVICE_URL trỏ đúng):
 *   node src/scripts/backfillCvEmbedding.js          # xem trước
 *   node src/scripts/backfillCvEmbedding.js --apply  # ghi thật
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CvProfile = require('../models/CvProfile');
const Application = require('../models/Application');
const Job = require('../models/Job');
const aiService = require('../services/aiService');
const { buildCvEmbeddingText, isEmbeddable } = require('../utils/cvEmbeddingText');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.AI_SERVICE_URL) {
    console.error('Thiếu AI_SERVICE_URL — không gọi được AI service.');
    process.exit(1);
  }
  console.log('AI_SERVICE_URL =', process.env.AI_SERVICE_URL);
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply) <<<\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const cvs = await CvProfile.find({});
  let embedded = 0;
  let skippedEmpty = 0;
  let alreadyOk = 0;
  let failed = 0;

  for (const cv of cvs) {
    const label = `${cv.fullName || '(chưa đặt tên)'} · ${String(cv._id).slice(-6)}`;

    if (cv.embedding?.length > 0) {
      alreadyOk += 1;
      continue;
    }

    const text = buildCvEmbeddingText(cv);
    if (!isEmbeddable(text)) {
      // Hồ sơ trống thật (mới tạo, chưa nhập gì) — không phải lỗi
      console.log(`   bỏ qua  ${label} — hồ sơ chưa có nội dung (${text.length} ký tự)`);
      skippedEmpty += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`   sẽ tạo  ${label} — ${text.length} ký tự`);
      embedded += 1;
      continue;
    }

    try {
      const vector = await aiService.getEmbedding(text);
      if (!vector || vector.length === 0) throw new Error('AI trả về vector rỗng');
      cv.embedding = vector;
      cv.processingStatus = 'ready';
      cv.processingError = undefined;
      await cv.save();
      console.log(`   ✓ ${label} — ${vector.length} chiều`);
      embedded += 1;
    } catch (e) {
      console.log(`   ✗ ${label} — ${e.message}`);
      failed += 1;
    }
  }

  console.log('\n── Chấm lại điểm cho đơn ứng tuyển ──');
  const apps = await Application.find({}).populate('cvProfileId').populate('jobId');
  let rescored = 0;

  for (const app of apps) {
    const cvVec = app.cvProfileId?.embedding;
    const jobVec = app.jobId?.embedding;
    if (!cvVec?.length || !jobVec?.length) continue;

    if (!APPLY) {
      console.log(`   sẽ chấm lại đơn ${String(app._id).slice(-6)} (hiện ${app.matchingScore}%)`);
      rescored += 1;
      continue;
    }

    try {
      const raw = await aiService.calculateMatchingScore(cvVec, jobVec);
      const score = Math.round((raw || 0) * 100);
      console.log(`   đơn ${String(app._id).slice(-6)}: ${app.matchingScore}% → ${score}%`);
      app.matchingScore = score;
      await app.save();
      rescored += 1;
    } catch (e) {
      console.log(`   ✗ đơn ${String(app._id).slice(-6)} — ${e.message}`);
    }
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`CV đã có vector từ trước : ${alreadyOk}`);
  console.log(`CV ${APPLY ? 'đã tạo' : 'sẽ tạo'} vector      : ${embedded}`);
  console.log(`CV chưa có nội dung      : ${skippedEmpty}`);
  if (failed) console.log(`CV thất bại              : ${failed}`);
  console.log(`Đơn ${APPLY ? 'đã' : 'sẽ'} chấm lại        : ${rescored}`);
  console.log(APPLY ? 'Đã ghi vào database.' : 'Chưa ghi gì. Chạy lại với --apply để áp dụng.');

  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Lỗi:', err.message);
    process.exit(1);
  });
}
