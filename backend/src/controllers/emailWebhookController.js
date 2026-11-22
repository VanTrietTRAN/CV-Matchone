const crypto = require('crypto');
const governor = require('../services/mail/governor');
const unsubscribeLink = require('../services/mail/unsubscribe');
const { frontendOrigin } = require('../utils/frontendUrl');

/**
 * POST /webhooks/brevo — Brevo đẩy sự kiện thời gian thực về đây
 * (Transactional → Settings → Webhook). Circuit Breaker dựa vào các sự kiện
 * spam / hard_bounce / soft_bounce / deferred / blocked để tự ngắt P1/P2.
 *
 * Xác thực BẮT BUỘC (Bearer hoặc Basic, so với BREVO_WEBHOOK_TOKEN): ai cũng
 * gửi được sự kiện "spam" giả thì ai cũng tắt được đường gửi mail của hệ thống.
 */
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const isAuthorized = (req, token) => {
  const header = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(header)) return safeEqual(header.replace(/^Bearer\s+/i, '').trim(), token);
  if (/^Basic\s+/i.test(header)) {
    const decoded = Buffer.from(header.replace(/^Basic\s+/i, '').trim(), 'base64').toString('utf8');
    const password = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
    return safeEqual(password, token) || safeEqual(decoded, token);
  }
  return false;
};

// Brevo dùng tên sự kiện khác nhau giữa webhook transactional và marketing
const EVENT_ALIASES = {
  hardbounce: 'hard_bounce',
  hard_bounce: 'hard_bounce',
  softbounce: 'soft_bounce',
  soft_bounce: 'soft_bounce',
  invalid: 'invalid_email',
  invalid_email: 'invalid_email',
  spam: 'spam',
  complaint: 'spam',
  blocked: 'blocked',
  deferred: 'deferred',
  unsubscribe: 'unsubscribed',
  unsubscribed: 'unsubscribed',
  delivered: 'delivered',
  request: 'request',
  error: 'error',
};

const normalizeEvent = (raw) => {
  const name = String(raw?.event || '').trim().toLowerCase();
  const type = EVENT_ALIASES[name] || EVENT_ALIASES[name.replace(/_/g, '')];
  if (!type) return null;
  return {
    type,
    email: raw.email,
    messageId: raw['message-id'] || raw.messageId || raw.message_id,
    reason: raw.reason || raw.tag || undefined,
  };
};

const brevoWebhook = async (req, res) => {
  const token = String(process.env.BREVO_WEBHOOK_TOKEN || '').trim();
  if (!token) {
    return res.status(503).json({ message: 'Chưa cấu hình BREVO_WEBHOOK_TOKEN — webhook đang tắt.' });
  }
  if (!isAuthorized(req, token)) {
    return res.status(401).json({ message: 'Sai thông tin xác thực webhook.' });
  }

  const items = Array.isArray(req.body) ? req.body : [req.body];
  let handled = 0;
  for (const raw of items) {
    const ev = normalizeEvent(raw);
    if (!ev) continue; // opened, click... không ảnh hưởng breaker
    try {
      await governor.handleProviderEvent(ev);
      handled += 1;
    } catch (e) {
      console.error(`[BrevoWebhook] Lỗi xử lý sự kiện ${ev.type} (${ev.email}):`, e.message);
    }
  }
  // Luôn 200 khi đã xác thực: trả lỗi thì Brevo gửi lại, sự kiện bị đếm hai lần
  return res.json({ ok: true, handled });
};

// ─── Huỷ nhận thư (RFC 8058) ─────────────────────────────────────────────────

const page = (title, body) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:48px 16px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
${body}
</div></body></html>`;

/**
 * GET: hiện trang xác nhận có nút bấm — KHÔNG huỷ ngay, vì trình quét link của
 * hộp thư (Outlook, Gmail) tự mở mọi link trong thư và sẽ huỷ hộ người dùng.
 */
const unsubscribePage = (req, res) => {
  const email = unsubscribeLink.verify(req.query.e, req.query.t);
  if (!email) {
    return res.status(400).send(page('Link không hợp lệ', '<h2>Link huỷ nhận thư không hợp lệ hoặc đã hết hiệu lực.</h2>'));
  }
  const action = `?e=${encodeURIComponent(req.query.e)}&t=${encodeURIComponent(req.query.t)}`;
  return res.send(
    page(
      'Huỷ nhận thư gợi ý',
      `<h2 style="margin-top:0">Huỷ nhận thư gợi ý</h2>
<p>Ngừng gửi thư gợi ý việc làm và thư tổng hợp tới <strong>${email.replace(/</g, '&lt;')}</strong>?</p>
<p style="color:#64748b;font-size:14px">Thư bảo mật (mã đặt lại mật khẩu) vẫn gửi khi bạn yêu cầu.</p>
<form method="post" action="${action}"><input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit" style="background:#0f766e;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Huỷ nhận thư</button></form>`,
    ),
  );
};

/** POST: huỷ nhận một chạm (Gmail/Yahoo gọi thẳng, hoặc nút trên trang xác nhận). */
const unsubscribe = async (req, res) => {
  const email = unsubscribeLink.verify(req.query.e, req.query.t);
  if (!email) return res.status(400).send('Link không hợp lệ.');
  try {
    await governor.unsubscribe(email, 'unsubscribe_link');
  } catch (e) {
    console.error('[Unsubscribe] Lỗi:', e.message);
    return res.status(500).send('Không xử lý được, vui lòng thử lại.');
  }
  return res.send(
    page(
      'Đã huỷ nhận thư',
      `<h2 style="margin-top:0">Đã huỷ nhận thư gợi ý</h2>
<p>Bạn sẽ không nhận thư gợi ý việc làm và thư tổng hợp nữa. Có thể bật lại trong trang cài đặt email của tài khoản.</p>
<p><a href="${frontendOrigin()}" style="color:#0f766e">Về CVMatchOne</a></p>`,
    ),
  );
};

module.exports = { brevoWebhook, unsubscribePage, unsubscribe, normalizeEvent, isAuthorized };
