const crypto = require('crypto');

/**
 * Link huỷ nhận thư một chạm theo RFC 8058, gắn vào header List-Unsubscribe
 * của mọi thư làn P2 — Gmail yêu cầu với người gửi số lượng lớn, và người nhận
 * có nút huỷ ngay cạnh tên người gửi thì ít bấm "Báo cáo spam" hơn.
 *
 * Token là HMAC của địa chỉ email, nên link không đoán được và không cần lưu gì
 * trong database. Đổi khoá bí mật thì mọi link cũ hết hiệu lực.
 */
const secret = () =>
  String(process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || '').trim();

const b64url = (s) => Buffer.from(String(s)).toString('base64url');
const fromB64url = (s) => Buffer.from(String(s || ''), 'base64url').toString('utf8');

const sign = (email) =>
  crypto.createHmac('sha256', secret()).update(`unsub:${String(email).toLowerCase().trim()}`).digest('base64url').slice(0, 32);

/** Địa chỉ public của backend (không phải frontend) — link phải trỏ thẳng tới API. */
const apiOrigin = () => String(process.env.API_PUBLIC_URL || '').trim().replace(/\/+$/, '');

const unsubscribeUrl = (email) => {
  const origin = apiOrigin();
  if (!origin || !secret()) return null;
  return `${origin}/api/email/unsubscribe?e=${b64url(String(email).toLowerCase().trim())}&t=${sign(email)}`;
};

/** Header cho nodemailer. Thiếu API_PUBLIC_URL thì trả về {} — không gắn link hỏng. */
const unsubscribeHeaders = (email) => {
  const url = unsubscribeUrl(email);
  if (!url) return {};
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
};

/** @returns {string|null} địa chỉ email nếu token hợp lệ */
const verify = (e, t) => {
  if (!secret() || !e || !t) return null;
  const email = fromB64url(e).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  const expected = Buffer.from(sign(email));
  const given = Buffer.from(String(t));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return email;
};

module.exports = { unsubscribeUrl, unsubscribeHeaders, verify };
