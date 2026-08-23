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
    const res = await axios.get(`${url}/health`, { timeout });
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

const aiService = {
  getEmbedding: async (text) => {
    const base = aiUrl();
    if (!base) {
      return null;
    }
    try {
      const response = await axios.post(`${base}/get-embedding`, {
        text: text,
      });
      return response.data.embedding;
    } catch (error) {
      console.error("Lỗi khi gọi AI Service (Embedding):", error.message);
      if (error.response) {
        console.error("Chi tiết lỗi từ Python:", error.response.status, error.response.data);
      }
      return null;
    }
  },

  calculateMatchingScore: async (cvEmbedding, jobEmbedding) => {
    const base = aiUrl();
    if (!base) {
      return 0;
    }
    try {
      const response = await axios.post(`${base}/calculate-matching`, {
        cv_vector: cvEmbedding,
        job_vector: jobEmbedding,
      });
      return response.data.score;
    } catch (error) {
      console.error("Lỗi khi gọi AI Service (Matching):", error.message);
      return 0;
    }
  },
};

module.exports = aiService;
module.exports.getAiConfig = getAiConfig;
module.exports.checkAiHealth = checkAiHealth;
