const dns = require('dns').promises;

/**
 * Lọc danh sách trước khi import (Pre-Flight Hygiene).
 *
 * Danh sách import là danh sách "lạnh": người nhận chưa từng tương tác. Mỗi địa
 * chỉ gõ sai sinh ra một hard bounce, và vài hard bounce mỗi ngày là đủ kéo uy
 * tín tên miền xuống. Chặn ngay lúc import rẻ hơn nhiều so với gửi rồi bị trả về.
 */

// Tên miền gõ nhầm hay gặp → tên miền đúng. Chặn hẳn chứ không tự sửa: đoán sai
// là gửi mật khẩu tạm tới hộp thư của người khác.
const TYPO_DOMAINS = Object.freeze({
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.vn': 'gmail.com',
  'gmail.com.vn': 'gmail.com',
  'gmailcom': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'icloud.co': 'icloud.com',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + viết thường. */
const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

const domainOf = (email) => normalizeEmail(email).split('@')[1] || '';

/**
 * Kiểm tra cú pháp và tên miền gõ nhầm (không cần mạng).
 * @returns {null | string} lý do loại, hoặc null nếu ổn
 */
const syntaxProblem = (email) => {
  const addr = normalizeEmail(email);
  if (!EMAIL_RE.test(addr)) return 'Email không hợp lệ';
  const fix = TYPO_DOMAINS[domainOf(addr)];
  if (fix) return `Tên miền "${domainOf(addr)}" có vẻ gõ nhầm — có phải ${fix}?`;
  return null;
};

const mxCache = new Map(); // domain → { ok, reason, at }
const MX_CACHE_MS = 6 * 60 * 60 * 1000;
const MX_TIMEOUT_MS = 5000;

const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms)),
  ]);

/**
 * Tên miền có nhận thư không (có bản ghi MX)?
 *
 * Chỉ kết luận "không" khi DNS trả lời chắc chắn là không có (ENOTFOUND /
 * ENODATA). DNS chập chờn hay hết giờ thì cho qua — không chặn cả file import
 * chỉ vì máy chủ DNS chậm.
 *
 * @returns {Promise<{ok: boolean, reason?: string, uncertain?: boolean}>}
 */
const checkMx = async (domain) => {
  const d = String(domain || '').toLowerCase();
  if (!d) return { ok: false, reason: 'Thiếu tên miền' };
  const cached = mxCache.get(d);
  if (cached && Date.now() - cached.at < MX_CACHE_MS) return cached;

  let result;
  try {
    const records = await withTimeout(dns.resolveMx(d), MX_TIMEOUT_MS);
    const usable = (records || []).filter((r) => r.exchange && r.exchange !== '.');
    result = usable.length
      ? { ok: true }
      : { ok: false, reason: `Tên miền "${d}" khai báo không nhận thư (MX rỗng)` };
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA' || e.code === 'NXDOMAIN') {
      result = { ok: false, reason: `Tên miền "${d}" không có bản ghi MX — không nhận được thư` };
    } else {
      result = { ok: true, uncertain: true, reason: `Không kiểm tra được MX của "${d}" (${e.code || e.message})` };
    }
  }
  mxCache.set(d, { ...result, at: Date.now() });
  return result;
};

/**
 * Kiểm tra MX cho cả danh sách một lượt: mỗi tên miền chỉ hỏi DNS một lần,
 * chạy song song có giới hạn để file vài nghìn dòng không treo request import.
 * @returns {Promise<Map<string, {ok, reason?, uncertain?}>>} domain → kết quả
 */
const checkDomains = async (emails, concurrency = 8) => {
  const domains = [...new Set(emails.map(domainOf).filter(Boolean))];
  const out = new Map();
  let i = 0;
  const worker = async () => {
    while (i < domains.length) {
      const d = domains[i++];
      out.set(d, await checkMx(d));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
  return out;
};

/** Mã lô import, gắn lên từng tài khoản để breaker dừng riêng lô sinh bounce. */
const newImportBatchId = (prefix = 'imp') => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `${prefix}_${d}_${Math.random().toString(36).slice(2, 6)}`;
};

module.exports = {
  TYPO_DOMAINS,
  normalizeEmail,
  domainOf,
  syntaxProblem,
  checkMx,
  checkDomains,
  newImportBatchId,
};
