const axios = require("axios");

/**
 * Đọc và kiểm tra AI_SERVICE_URL.
 *
 * Trên Railway, biến này thường được đặt bằng reference variable
 * `http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:8000`. Nếu reference không resolve
 * (sai tên service, service chưa deploy, khác project) thì giá trị thật trở
 * thành `http://:8000` — vẫn là chuỗi hợp lệ về mặt cú pháp nên code cũ coi
 * như "có cấu hình" rồi gọi axios và thất bại lặng lẽ. Hậu quả: mọi CV đều 0%
 * phù hợp mà không có một dòng lỗi nào chỉ ra nguyên nhân.
 *
 * Ở đây bắt luôn trường hợp thiếu hostname và nói rõ ra.
 */
const readAiUrl = () => {
  const raw = (process.env.AI_SERVICE_URL || "").trim();
  if (!raw) return { url: "", error: "AI_SERVICE_URL chưa được đặt" };

  // "http://:8000" — reference variable của Railway không resolve nên mất hostname.
  // new URL() ném lỗi với chuỗi này, nên bắt riêng để nói đúng cách sửa.
  const MISSING_HOST_HINT =
    `Trên Railway thường do reference \${{ai.RAILWAY_PRIVATE_DOMAIN}} không resolve ` +
    `(sai tên service, service chưa deploy, hoặc khác project). Đặt thẳng ` +
    `AI_SERVICE_URL=http://ai.railway.internal:8000 rồi Restart service backend.`;

  if (/^\w+:\/\/:\d+/.test(raw)) {
    return { url: "", error: `AI_SERVICE_URL thiếu hostname: "${raw}". ${MISSING_HOST_HINT}` };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: "", error: `AI_SERVICE_URL không phải URL hợp lệ: "${raw}"` };
  }

  if (!parsed.hostname) {
    return { url: "", error: `AI_SERVICE_URL thiếu hostname: "${raw}". ${MISSING_HOST_HINT}` };
  }

  return { url: raw.replace(/\/+$/, ""), error: null };
};

/** Chỉ cảnh báo một lần cho mỗi loại lỗi, tránh spam log ở mỗi request. */
let warnedFor = null;
const aiUrl = () => {
  const { url, error } = readAiUrl();
  if (error && warnedFor !== error) {
    warnedFor = error;
    console.error(`[AI] ${error}`);
  }
  return url;
};

/** Cho /health và trang giám sát của admin biết cấu hình có dùng được không. */
const getAiConfig = () => {
  const { url, error } = readAiUrl();
  return { configured: Boolean(url), url, error };
};

/** Gọi /health của AI service để biết nó có thật sự sống không. */
const checkAiHealth = async (timeout = 4000) => {
  const { url, error } = readAiUrl();
  if (!url) return { reachable: false, error };
  try {
    const res = await axios.get(`${url}/health`, { timeout, headers: aiHeaders() });
    return {
      reachable: true,
      status: res.data?.status || "unknown",
      geminiKeyConfigured: Boolean(res.data?.gemini_key_configured),
      dimensions: res.data?.dimensions,
    };
  } catch (e) {
    return { reachable: false, error: e.message };
  }
};

// Timeout cho mọi lời gọi AI: không có timeout thì AI service treo là request
// của người dùng (và lượt cron) treo theo vô hạn.
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 15000;

/** Khoá dùng chung với AI service (AI_API_KEY ở cả hai bên). */
const aiHeaders = () => {
  const key = String(process.env.AI_API_KEY || "").trim();
  return key ? { "X-AI-API-Key": key } : {};
};

/**
 * Cosine similarity tính ngay trong Node.
 *
 * Trước đây mỗi cặp CV–tin là một HTTP POST sang AI service: trang gợi ý việc
 * làm với 200 tin mở = 200 request mỗi lần tải trang. Phép tính chỉ là một vòng
 * lặp 768 phần tử (< 1ms cho 200 tin), không cần qua mạng.
 * Vector lệch chiều hoặc có NaN/Infinity thì trả 0 thay vì kết quả rác.
 */
const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  const score = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Number.isFinite(score) ? score : 0;
};

const aiService = {
  getEmbedding: async (text) => {
    const base = aiUrl();
    if (!base) {
      return null;
    }
    const input = typeof text === "string" ? text.trim() : "";
    if (!input) return null;
    try {
      const response = await axios.post(
        `${base}/get-embedding`,
        // AI service giới hạn độ dài đầu vào; cắt ở đây để khỏi nhận 422
        { text: input.slice(0, 10000) },
        { timeout: AI_TIMEOUT_MS, headers: aiHeaders() },
      );
      return response.data.embedding;
    } catch (error) {
      console.error("Lỗi khi gọi AI Service (Embedding):", error.message);
      if (error.response) {
        console.error("Chi tiết lỗi từ Python:", error.response.status, error.response.data);
      }
      return null;
    }
  },

  // Giữ chữ ký async để các chỗ gọi cũ không phải đổi
  calculateMatchingScore: async (cvEmbedding, jobEmbedding) => cosineSimilarity(cvEmbedding, jobEmbedding),
};

module.exports = aiService;
module.exports.getAiConfig = getAiConfig;
module.exports.checkAiHealth = checkAiHealth;
module.exports.cosineSimilarity = cosineSimilarity;
