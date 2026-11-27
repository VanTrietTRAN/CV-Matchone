/**
 * Cấu hình Brevo cho đường gửi mail (BREVO-EMAIL.md mục 9) qua Brevo API —
 * thay cho việc bấm tay trên giao diện:
 *
 *   1. Kiểm tra tên miền gửi đã xác thực, và địa chỉ SECURITY_SENDER_EMAIL là
 *      sender hợp lệ (thiếu thì tạo).
 *   2. Tạo hoặc cập nhật webhook transactional trỏ về /webhooks/brevo, xác thực
 *      bằng BREVO_WEBHOOK_TOKEN, nhận các sự kiện Circuit Breaker cần.
 *
 * Không gửi thư nào. Mặc định chỉ ĐỌC và in kế hoạch; thêm --apply để ghi.
 *
 * Cần biến môi trường:
 *   BREVO_API_KEY         API key Brevo (bắt đầu bằng "xkeysib-", KHÁC SMTP key)
 *   API_PUBLIC_URL        vd https://api.cvoneclickmatch.com
 *   BREVO_WEBHOOK_TOKEN   token webhook (đã đặt trên Railway)
 *   SECURITY_SENDER_EMAIL / SENDER_EMAIL
 *
 * Chạy trên Railway (đọc biến của service Backend, không lộ ra máy):
 *   railway run --service Backend node src/scripts/brevoSetup.js
 *   railway run --service Backend node src/scripts/brevoSetup.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const axios = require('axios');

const APPLY = process.argv.includes('--apply');
const API = 'https://api.brevo.com/v3';

// Sự kiện webhook transactional (tên theo API tạo webhook của Brevo)
const EVENTS = ['hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'delivered'];

const parseAddress = (v) => {
  const s = String(v || '').trim();
  const m = s.match(/^(.*)<([^>]+)>$/);
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim().toLowerCase() } : { name: '', email: s.toLowerCase() };
};

async function main() {
  const key = String(process.env.BREVO_API_KEY || '').trim();
  if (!key.startsWith('xkeysib-')) {
    throw new Error(
      'Thiếu BREVO_API_KEY (API key bắt đầu bằng "xkeysib-", lấy ở Brevo → Settings → SMTP & API → API Keys). ' +
        'SMTP key "xsmtpsib-" không dùng được cho API.',
    );
  }
  const origin = String(process.env.API_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.BREVO_WEBHOOK_TOKEN || '').trim();
  if (!origin) throw new Error('Thiếu API_PUBLIC_URL.');
  if (!token) throw new Error('Thiếu BREVO_WEBHOOK_TOKEN.');

  const http = axios.create({ baseURL: API, headers: { 'api-key': key, accept: 'application/json' }, timeout: 20000 });
  console.log(APPLY ? '\n>>> CHẾ ĐỘ GHI THẬT <<<\n' : '\n>>> Xem trước, không ghi gì (thêm --apply để ghi) <<<\n');

  const account = (await http.get('/account')).data;
  console.log(`Tài khoản Brevo: ${account.companyName || ''} (${account.email})`);

  // ── 1. Tên miền và sender ──────────────────────────────────────────────────
  const security = parseAddress(process.env.SECURITY_SENDER_EMAIL || process.env.SENDER_EMAIL);
  const domain = security.email.split('@')[1];
  const domains = (await http.get('/senders/domains')).data.domains || [];
  const d = domains.find((x) => String(x.domain_name).toLowerCase() === domain);
  console.log(
    d
      ? `Tên miền ${domain}: authenticated=${d.authenticated}, verified=${d.verified}`
      : `Tên miền ${domain}: CHƯA có trong Brevo`,
  );

  const senders = (await http.get('/senders')).data.senders || [];
  const s = senders.find((x) => String(x.email).toLowerCase() === security.email);
  if (s) {
    console.log(`Sender ${security.email}: active=${s.active}`);
  } else {
    console.log(`Sender ${security.email}: chưa có.`);
    if (APPLY) {
      const r = await http.post('/senders', { name: security.name || 'CVMatchOne', email: security.email });
      console.log(`  → Đã tạo sender id=${r.data.id}.` + (d?.authenticated ? ' Tên miền đã xác thực nên dùng được ngay.' : ' Brevo sẽ gửi thư xác minh tới địa chỉ này.'));
    } else {
      console.log('  → Sẽ tạo sender này khi chạy --apply.');
    }
  }
  if (!d?.authenticated && !s?.active) {
    console.log(
      `\n⚠ ${security.email} có thể bị Brevo từ chối: tên miền chưa xác thực và sender chưa active. ` +
        'Giữ SECURITY_SENDER_EMAIL = địa chỉ no-reply cho tới khi xử lý xong.',
    );
  }

  // ── 2. Webhook transactional ───────────────────────────────────────────────
  const url = `${origin}/webhooks/brevo`;
  // Tài khoản chưa có webhook nào thì Brevo trả 400 document_not_found thay vì danh sách rỗng
  const hooks = await http
    .get('/webhooks', { params: { type: 'transactional' } })
    .then((r) => r.data.webhooks || [])
    .catch((e) => {
      if (e.response?.data?.code === 'document_not_found') return [];
      throw e;
    });
  const existing = hooks.find((h) => h.url === url);
  const body = {
    url,
    description: 'CVMatchOne Circuit Breaker',
    events: EVENTS,
    auth: { type: 'bearer', token },
  };

  if (existing) {
    console.log(`\nWebhook đã có (id=${existing.id}), sự kiện: ${(existing.events || []).join(', ')}`);
    if (APPLY) {
      await http.put(`/webhooks/${existing.id}`, { description: body.description, events: body.events, auth: body.auth });
      console.log('  → Đã cập nhật sự kiện và token xác thực.');
    } else {
      console.log('  → Sẽ cập nhật sự kiện + token khi chạy --apply.');
    }
  } else {
    console.log(`\nChưa có webhook trỏ tới ${url}.`);
    if (APPLY) {
      const r = await http.post('/webhooks', { ...body, type: 'transactional' });
      console.log(`  → Đã tạo webhook id=${r.data.id} với sự kiện: ${EVENTS.join(', ')}`);
    } else {
      console.log(`  → Sẽ tạo webhook (sự kiện: ${EVENTS.join(', ')}) khi chạy --apply.`);
    }
  }

  // Kiểm tra endpoint: không kèm token phải bị từ chối, kèm token phải 200
  const noAuth = await axios.post(url, {}, { validateStatus: () => true, timeout: 15000 });
  const withAuth = await axios.post(url, { event: 'request', email: 'probe@example.invalid' }, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 15000,
  });
  console.log(`\nEndpoint ${url}: không token → ${noAuth.status}, có token → ${withAuth.status}`);
}

main().catch((e) => {
  const detail = e.response ? `${e.response.status} ${JSON.stringify(e.response.data)}` : e.message;
  console.error('Lỗi:', detail);
  process.exitCode = 1;
});
