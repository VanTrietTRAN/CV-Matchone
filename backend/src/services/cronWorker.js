const cron = require("node-cron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const pdfParse = require("pdf-parse");
const { createWorker } = require("tesseract.js");
const { fromPath } = require("pdf2pic");

const CvProfile = require("../models/CvProfile");
const storageService = require("./storageService");
const aiService = require("./aiService");
const cvExtractor = require("./cvExtractor");
const { buildCvEmbeddingText, isEmbeddable } = require("../utils/cvEmbeddingText");

// OCR tối đa ngần này trang — CV scan nhiều trang trước đây chỉ đọc trang 1
const OCR_MAX_PAGES = 5;
// Độ dài văn bản đưa cho LLM bóc tách. 3000 ký tự cắt mất nửa sau của CV hai
// trang (kinh nghiệm, kỹ năng thường nằm cuối).
const EXTRACT_MAX_CHARS = 12000;
// Hồ sơ kẹt ở 'processing' quá lâu (server tắt giữa chừng) thì thu hồi lại
const STUCK_PROCESSING_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

// To run OCR, we write the file buffer to temporary storage and clear it immediately
const extractTextWithOCRFromBuffer = async (pdfBuffer, pageCount = 1) => {
  console.log("[Worker] Running OCR fallback from Buffer...");
  const tempDir = os.tmpdir();
  const tempFilename = `ocr_temp_${Date.now()}`;
  const tempFilePath = path.join(tempDir, `${tempFilename}.pdf`);
  
  const imagePaths = [];
  let worker = null;

  try {
    fs.writeFileSync(tempFilePath, pdfBuffer);

    const convert = fromPath(tempFilePath, {
      density: 200,
      saveFilename: tempFilename,
      savePath: tempDir,
      format: "png",
      width: 1240,
      height: 1754,
    });

    const pages = Math.max(1, Math.min(Number(pageCount) || 1, OCR_MAX_PAGES));
    worker = await createWorker("eng+vie");
    const texts = [];
    for (let page = 1; page <= pages; page += 1) {
      const pageImage = await convert(page, { responseType: "image" });
      imagePaths.push(pageImage.path);
      const {
        data: { text },
      } = await worker.recognize(pageImage.path);
      texts.push(text);
    }
    console.log(`[Worker] OCR xong ${pages} trang.`);
    return texts.join("\n\n");
  } catch (error) {
    // pdf2pic gọi binary GraphicsMagick/Ghostscript ở ngoài Node. Khi máy chủ chưa cài,
    // lỗi ném ra rất khó đoán ("Command failed", ENOENT...) nên diễn giải lại cho rõ.
    const raw = String(error && error.message);
    if (/ENOENT|not found|command failed|gm\/convert|gs:/i.test(raw)) {
      throw new Error(
        `OCR không chạy được — máy chủ thiếu GraphicsMagick hoặc Ghostscript. ` +
          `Xem backend/nixpacks.toml. Lỗi gốc: ${raw}`,
      );
    }
    throw error;
  } finally {
    // terminate() trong finally: recognize() ném lỗi thì worker Tesseract (một
    // tiến trình con nặng hàng trăm MB) trước đây bị bỏ lại không ai dọn.
    if (worker) await worker.terminate().catch(() => {});
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    for (const img of imagePaths) {
      if (img && fs.existsSync(img)) fs.unlinkSync(img);
    }
  }
};

/**
 * Hồ sơ nhập tay (không có file PDF): chỉ tạo lại vector từ các trường đã nhập.
 * Hồ sơ trống hoàn toàn cũng được coi là xong — không có gì để nhúng không phải lỗi.
 */
const embedManualProfile = async (cv) => {
  const text = buildCvEmbeddingText(cv);

  if (!isEmbeddable(text)) {
    console.log(`[Worker] Hồ sơ ${cv._id} chưa có nội dung để nhúng — đánh dấu ready.`);
    cv.processingStatus = "ready";
    cv.processingError = null;
    await cv.save();
    return;
  }

  const vector = await aiService.getEmbedding(text.substring(0, 3000));
  if (!vector || vector.length === 0) {
    throw new Error("AI service trả về vector rỗng khi nhúng hồ sơ nhập tay");
  }

  cv.embedding = vector;
  cv.processingStatus = "ready";
  cv.processingError = null;
  await cv.save();
  console.log(`[Worker] Đã nhúng lại hồ sơ nhập tay ${cv._id} — ${vector.length} chiều.`);
};

/**
 * Ghép kết quả bóc tách vào hồ sơ: chỉ ghi đè khi LLM trả giá trị có nghĩa.
 * Bản cũ gán thẳng `extracted.headline || ""` — thử lại AI là xoá trắng những
 * gì ứng viên đã tự nhập mỗi khi LLM bỏ sót trường đó.
 */
const mergeExtracted = (cv, data, fallbackSummary) => {
  const has = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null);
  const fields = [
    "fullName", "headline", "email", "phone", "location", "address",
    "dateOfBirth", "website", "summary", "skills", "certifications",
    "experience", "education",
  ];
  for (const f of fields) {
    if (data && has(data[f])) cv[f] = data[f];
  }
  if (!has(cv.fullName)) cv.fullName = "Chưa cập nhật";
  if (!has(cv.summary)) cv.summary = fallbackSummary;
};

/** Thu hồi hồ sơ kẹt 'processing' (server khởi động lại giữa chừng). */
const recoverStuckJobs = async () => {
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_MS);
  const stuck = { processingStatus: "processing", $or: [{ lastAiAttemptAt: { $lte: cutoff } }, { lastAiAttemptAt: null }] };
  await CvProfile.updateMany(
    { ...stuck, attempts: { $gte: MAX_ATTEMPTS - 1 } },
    { $set: { processingStatus: "failed", processingError: "Bị gián đoạn khi đang bóc tách." }, $inc: { attempts: 1 } },
  );
  const r = await CvProfile.updateMany(
    stuck,
    { $set: { processingStatus: "queued", processingError: "Bị gián đoạn, đã xếp lại hàng đợi." }, $inc: { attempts: 1 } },
  );
  if (r.modifiedCount) console.warn(`[Worker] Thu hồi ${r.modifiedCount} hồ sơ kẹt ở trạng thái processing.`);
};

// Một job tại một thời điểm: OCR + LLM của một CV có thể lâu hơn 30 giây của
// lịch, trước đây lượt sau chạy chồng lên và hai Tesseract cùng ngốn RAM.
let jobRunning = false;

/**
 * Main function to process a single queued CV job from the database
 */
const processSingleCvJob = async () => {
  if (jobRunning) return { busy: true };
  jobRunning = true;
  let cv = null;
  try {
    await recoverStuckJobs();

    // 1. Claim one queued job atomically (FIFO order)
    cv = await CvProfile.findOneAndUpdate(
      {
        processingStatus: "queued",
        attempts: { $lt: MAX_ATTEMPTS }
      },
      {
        $set: { processingStatus: "processing", lastAiAttemptAt: new Date() }
      },
      {
        new: true,
        sort: { createdAt: 1 }
      }
    );

    if (!cv) {
      return; // No jobs in queue
    }

    console.log(`[Worker] Started processing CV Job for profile ID: ${cv._id} (Attempts: ${cv.attempts})`);

    // 2. Hồ sơ nhập tay không có file PDF. Bản cũ ném "No fileUrl present" rồi
    // đốt hết 3 lượt thử và đánh dấu failed — admin bấm "Thử lại AI" trên một
    // hồ sơ nhập tay là chắc chắn hỏng nó. Với hồ sơ kiểu này chỉ cần tạo lại
    // vector từ chính các trường đã nhập.
    if (!cv.fileUrl) {
      await embedManualProfile(cv);
      return;
    }

    console.log(`[Worker] Fetching file buffer for key: ${cv.fileUrl}`);
    const fileBuffer = await storageService.getFileBuffer(cv.fileUrl);

    // 3. Parse PDF text
    console.log("[Worker] Parsing PDF content...");
    const pdfData = await pdfParse(fileBuffer);
    let extractedText = pdfData.text;

    if (!extractedText || extractedText.trim().length < 50) {
      console.log("[Worker] Low character count -> falling back to OCR...");
      extractedText = await extractTextWithOCRFromBuffer(fileBuffer, pdfData.numpages);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("Could not extract any text content from the PDF");
    }

    const textToSend = extractedText.substring(0, EXTRACT_MAX_CHARS);

    // 4. Generate AI Embeddings Vector (Gemini)
    console.log("[Worker] Generating vector embeddings...");
    const embeddingVector = await aiService.getEmbedding(textToSend);
    if (!embeddingVector || embeddingVector.length === 0) {
      throw new Error("Embedding generation returned empty or null vector");
    }

    // 5. Extract Profile Information (Gemini -> Groq -> Regex)
    console.log("[Worker] Extracting profile details...");
    const extractedData = await cvExtractor.extractCvData(textToSend);

    // 6. Update database with parsed fields and vector
    mergeExtracted(cv, extractedData, textToSend.substring(0, 3000));
    cv.embedding = embeddingVector;
    cv.processingStatus = "ready";
    cv.processingError = null;

    await cv.save();
    console.log(`[Worker] SUCCESS: CV Profile ID ${cv._id} processed successfully`);

  } catch (error) {
    console.error(`[Worker] CRITICAL: Error processing CV Job: ${error.message}`);
    
    if (cv) {
      try {
        const nextAttempts = cv.attempts + 1;
        if (nextAttempts >= 3) {
          // Permanently fail the job
          await CvProfile.updateOne(
            { _id: cv._id },
            { 
              $set: { 
                processingStatus: "failed", 
                processingError: error.message,
                attempts: nextAttempts
              } 
            }
          );
          console.log(`[Worker] Job marked as permanently FAILED for profile ID ${cv._id}`);
        } else {
          // Re-queue for another attempt
          await CvProfile.updateOne(
            { _id: cv._id },
            { 
              $set: { 
                processingStatus: "queued", 
                processingError: error.message,
                attempts: nextAttempts
              } 
            }
          );
          console.log(`[Worker] Job re-queued for profile ID ${cv._id} (Next attempt: ${nextAttempts})`);
        }
      } catch (dbErr) {
        console.error(`[Worker] Failed to update fail state in DB for CV ${cv._id}:`, dbErr.message);
      }
    }
  } finally {
    jobRunning = false;
  }
};

/**
 * Initialize the Node-cron schedule
 */
const initCronWorker = () => {
  console.log("[Worker] Initializing Background Cron Worker (30s schedule)...");
  
  // Runs every 30 seconds
  cron.schedule("*/30 * * * * *", async () => {
    try {
      await processSingleCvJob();
    } catch (err) {
      console.error("[Worker] Cron loop encountered error:", err.message);
    }
  });
};

module.exports = {
  initCronWorker,
  processSingleCvJob,
  mergeExtracted,
};
