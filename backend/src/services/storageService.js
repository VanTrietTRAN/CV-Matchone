const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const CvFile = require("../models/CvFile");

/**
 * Lưu trữ file CV — hai đường: Cloudflare R2 hoặc MongoDB.
 *
 * Bản cũ luôn dựng S3Client ngay khi nạp module. Khi các biến R2_* chưa được
 * đặt, endpoint trở thành "https://undefined.r2.cloudflarestorage.com" và
 * bucket là undefined, nên mọi lần upload đều ném lỗi khó hiểu
 * ("No value provided for input HTTP label: Bucket"). cvController bắt lỗi này
 * rồi trả 500 kèm câu chung chung, khiến tính năng import CV hỏng mà không ai
 * lần ra được nguyên nhân.
 *
 * Nay:
 *   - Thiếu cấu hình R2   -> tự động lưu file trong MongoDB (collection cvfiles).
 *   - Khoá R2 sai độ dài  -> cũng lưu trong MongoDB, kèm cảnh báo nói rõ khoá nào
 *                            sai và lệch bao nhiêu ký tự. Cloudflare từ chối những
 *                            khoá này ngay ở tầng chữ ký ("Credential access key
 *                            has length 31, should be 32"), nên nếu vẫn cố gọi R2
 *                            thì người dùng không upload được CV nữa.
 *   - Có đủ cấu hình R2   -> dùng R2 như trước.
 * Hai chế độ dùng chung một khoá (key) nên phần còn lại của hệ thống không đổi.
 */

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];

/**
 * Đọc biến môi trường và cắt khoảng trắng thừa.
 *
 * Dán khoá từ Cloudflare Dashboard rất dễ kèm theo dấu cách hoặc xuống dòng ở
 * cuối. Bản trước dùng thẳng giá trị thô nên chữ ký request sai mà không rõ vì sao.
 */
const envValue = (name) => String(process.env[name] || "").trim();

/** Những biến R2 còn thiếu — dùng cho /health và thông báo lỗi. */
const missingR2Vars = () => R2_VARS.filter((name) => !envValue(name));

/**
 * Độ dài bắt buộc của từng khoá R2. Cloudflare từ chối ngay ở tầng chữ ký nếu
 * sai, với thông báo kiểu "Credential access key has length 31, should be 32" —
 * gần như luôn là do dán thiếu hoặc thừa ký tự.
 */
const R2_KEY_SHAPES = {
  R2_ACCOUNT_ID: { length: 32, label: "Account ID" },
  R2_ACCESS_KEY_ID: { length: 32, label: "Access Key ID" },
  R2_SECRET_ACCESS_KEY: { length: 64, label: "Secret Access Key" },
};

/**
 * Những khoá R2 có mặt nhưng sai độ dài.
 * @returns {{name: string, label: string, actual: number, expected: number}[]}
 */
const malformedR2Vars = () =>
  Object.entries(R2_KEY_SHAPES)
    .map(([name, shape]) => ({ name, value: envValue(name), ...shape }))
    .filter((v) => v.value && v.value.length !== v.length)
    .map((v) => ({ name: v.name, label: v.label, actual: v.value.length, expected: v.length }));

/** R2 chỉ dùng được khi đủ biến VÀ các khoá đúng độ dài. */
const isR2Configured = () => missingR2Vars().length === 0 && malformedR2Vars().length === 0;

/**
 * Dựng S3Client trễ (chỉ khi thật sự cần) và dùng lại.
 * Dựng sớm ở cấp module sẽ chốt cứng giá trị env lúc nạp file.
 */
let cachedClient = null;
let cachedFor = null;
const r2Client = () => {
  const signature = R2_VARS.map(envValue).join("|");
  if (cachedClient && cachedFor === signature) return cachedClient;

  cachedClient = new S3Client({
    region: "auto", // Cloudflare R2 bắt buộc region là "auto"
    endpoint: `https://${envValue("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: envValue("R2_ACCESS_KEY_ID"),
      secretAccessKey: envValue("R2_SECRET_ACCESS_KEY"),
    },
  });
  cachedFor = signature;
  return cachedClient;
};

/** Chỉ ghi log cảnh báo cấu hình một lần cho mỗi nội dung, tránh spam. */
let warnedNote = null;
const warnOnce = (note) => {
  if (warnedNote === note) return;
  warnedNote = note;
  console.warn(`[Storage] ${note}`);
};

/**
 * Cho /health và trang giám sát biết file CV đang được cất ở đâu.
 * @returns {{driver: 'r2'|'mongo', missingR2Vars: string[], invalidR2Vars: object[], note: string}}
 */
const getStorageConfig = () => {
  const missing = missingR2Vars();
  const malformed = malformedR2Vars();

  if (missing.length === 0 && malformed.length === 0) {
    return {
      driver: "r2",
      missingR2Vars: [],
      invalidR2Vars: [],
      note: "File CV lưu trên Cloudflare R2.",
    };
  }

  // Khoá sai độ dài nguy hiểm hơn thiếu khoá: người vận hành tưởng đã cấu hình
  // xong, còn Cloudflare thì từ chối mọi request. Nói rõ khoá nào, lệch bao nhiêu.
  let note;
  if (malformed.length > 0) {
    const detail = malformed
      .map((v) => `${v.name} (${v.label}) dài ${v.actual} ký tự, phải là ${v.expected}`)
      .join("; ");
    note =
      `Khoá Cloudflare R2 sai định dạng: ${detail}. Gần như chắc chắn do dán ` +
      `thiếu hoặc thừa ký tự. Vào Cloudflare Dashboard → R2 → Manage R2 API Tokens, ` +
      `tạo token mới rồi dán lại đủ cả chuỗi. Trong lúc chờ, file CV được lưu ` +
      `trong MongoDB nên import CV vẫn chạy bình thường.`;
  } else {
    note =
      `Chưa cấu hình Cloudflare R2 (thiếu: ${missing.join(", ")}) nên file CV đang ` +
      `lưu trong MongoDB. Import CV và bóc tách AI vẫn chạy bình thường. ` +
      `Đặt đủ 4 biến R2_* trên service backend rồi Restart để chuyển sang R2.`;
  }

  if (malformed.length > 0) warnOnce(note);

  return { driver: "mongo", missingR2Vars: missing, invalidR2Vars: malformed, note };
};

/**
 * Đưa file lên nơi lưu trữ.
 * @param {Buffer} fileBuffer
 * @param {string} fileName - khoá duy nhất của file
 * @param {string} mimeType
 * @param {{userId?: any}} [meta]
 * @returns {Promise<string>} khoá để lưu vào database
 */
const uploadFile = async (fileBuffer, fileName, mimeType, meta = {}) => {
  if (!isR2Configured()) {
    await CvFile.findOneAndUpdate(
      { key: fileName },
      {
        key: fileName,
        userId: meta.userId,
        mimeType,
        size: fileBuffer.length,
        data: fileBuffer,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return fileName;
  }

  await r2Client().send(
    new PutObjectCommand({
      Bucket: envValue("R2_BUCKET_NAME"),
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    }),
  );
  return fileName;
};

/** Xoá file khỏi nơi lưu trữ. Xoá cả hai đường để không bỏ sót file cũ. */
const deleteFile = async (fileKey) => {
  if (!fileKey) return;

  // Luôn dọn bản trong Mongo — file có thể đã được lưu ở đó trước khi bật R2.
  await CvFile.deleteOne({ key: fileKey }).catch(() => {});

  if (!isR2Configured()) return;
  await r2Client().send(
    new DeleteObjectCommand({ Bucket: envValue("R2_BUCKET_NAME"), Key: fileKey }),
  );
};

/**
 * Link tải tạm thời (5 phút).
 * Ở chế độ MongoDB không có link ký sẵn — trả null để controller tự stream file.
 * @returns {Promise<string|null>}
 */
const getSignedDownloadUrl = async (fileKey) => {
  if (!fileKey || !isR2Configured()) return null;
  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({ Bucket: envValue("R2_BUCKET_NAME"), Key: fileKey }),
    { expiresIn: 300 },
  );
};

/**
 * Đọc file về dạng Buffer.
 * Thử Mongo trước vì file cũ có thể còn nằm lại đó sau khi bật R2.
 * @returns {Promise<Buffer|null>}
 */
const getFileBuffer = async (fileKey) => {
  if (!fileKey) return null;

  const local = await CvFile.findOne({ key: fileKey }).lean();
  if (local?.data) return Buffer.from(local.data.buffer || local.data);

  if (!isR2Configured()) {
    const { note } = getStorageConfig();
    throw new Error(`Không tìm thấy file "${fileKey}" trong MongoDB. ${note}`);
  }

  const response = await r2Client().send(
    new GetObjectCommand({ Bucket: envValue("R2_BUCKET_NAME"), Key: fileKey }),
  );
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
};

module.exports = {
  uploadFile,
  deleteFile,
  getSignedDownloadUrl,
  getFileBuffer,
  getStorageConfig,
  isR2Configured,
};
