const nodemailer = require('nodemailer');
const { frontendOrigin } = require('../utils/frontendUrl');
const { htmlToText } = require('../utils/htmlToText');
const templates = require('./emailTemplates');

/**
 * Mẫu email admin sửa được, lưu trong SystemSetting key 'email_templates'.
 * Cache lại để mỗi lần gửi không phải truy vấn database; gọi
 * `invalidateTemplateCache()` sau khi admin lưu.
 */
let templateCache = null;
const loadTemplates = async () => {
  if (templateCache) return templateCache;
  try {
    const SystemSetting = require('../models/SystemSetting');
    const rec = await SystemSetting.findOne({ key: 'email_templates' }).lean();
    templateCache = templates.mergeTemplates(rec?.value);
  } catch (e) {
    console.error('[Email] Không đọc được mẫu email, dùng mặc định:', e.message);
    templateCache = templates.mergeTemplates(null);
  }
  return templateCache;
};
const invalidateTemplateCache = () => {
  templateCache = null;
};

let transporter = null;

const DEFAULT_SENDER = 'CVMatchOne <no-reply@cvoneclickmatch.com>';

/** Giá trị mẫu trong .env.example — có nghĩa là chưa ai điền gì thật. */
const PLACEHOLDER = /^your_|your_brevo|example\.com|changeme|smartrecruit\.vn/i;

/**
 * Đọc và kiểm tra cấu hình SMTP.
 *
 * Brevo trả về đúng một mã lỗi 535 cho mọi kiểu sai thông tin đăng nhập, nên
 * không nhìn vào log thì không đoán được sai ở đâu. Ba nguyên nhân phổ biến nhất
 * đều nhận diện được từ chính giá trị biến môi trường:
 *
 *   1. Dán nhầm API key (xkeysib-) vào ô SMTP key (xsmtpsib-). Khoá vẫn hợp lệ,
 *      nhưng hợp lệ cho giao diện khác.
 *   2. Khoá dính dấu cách hoặc xuống dòng ở đầu/cuối khi copy.
 *   3. Dùng email đăng nhập Brevo làm SMTP login. SMTP login có dạng
 *      xxx@smtp-brevo.com, khác với email tài khoản.
 *
 * @returns {{host: string, port: number, user: string, pass: string, sender: string,
 *            configured: boolean, problems: string[], warnings: string[]}}
 */
const readEmailConfig = () => {
  const raw = (name) => String(process.env[name] || '');
  const val = (name) => raw(name).trim();

  const host = val('EMAIL_HOST') || 'smtp-relay.brevo.com';
  const port = Number(val('EMAIL_PORT')) || 587;
  const user = val('EMAIL_USER') || val('BREVO_USER');
  const pass = val('EMAIL_PASS') || val('BREVO_SMTP_KEY');
  const sender = val('SENDER_EMAIL') || DEFAULT_SENDER;
  const replyTo = val('REPLY_TO');
  // Thư làn P0 (mã đặt lại mật khẩu, mã xác thực) đi từ địa chỉ riêng, vd
  // security@: người nhận lọc thư dễ hơn, và bộ lọc thư rác của nhà cung cấp
  // đánh giá luồng này tách khỏi luồng thư gợi ý. Trống thì dùng SENDER_EMAIL.
  const securitySender = val('SECURITY_SENDER_EMAIL') || sender;

  const problems = [];
  const warnings = [];
  const isBrevo = /brevo\.com$/i.test(host);

  if (!user) problems.push('Chưa đặt EMAIL_USER (SMTP login).');
  if (!pass) problems.push('Chưa đặt EMAIL_PASS (SMTP key).');

  if (user && PLACEHOLDER.test(user)) {
    problems.push(`EMAIL_USER vẫn là giá trị mẫu ("${user}"), chưa phải SMTP login thật.`);
  }
  if (pass && PLACEHOLDER.test(pass)) {
    problems.push('EMAIL_PASS vẫn là giá trị mẫu, chưa phải SMTP key thật.');
  }

  // Khoá API và khoá SMTP của Brevo khác nhau; dán nhầm là lỗi 535 kinh điển.
  if (pass.startsWith('xkeysib-')) {
    problems.push(
      'EMAIL_PASS đang là API key (bắt đầu bằng "xkeysib-"). SMTP relay cần SMTP key ' +
        '(bắt đầu bằng "xsmtpsib-"). Lấy ở Brevo → bánh răng (Settings) → SMTP & API.',
    );
  }

  // So sánh chuỗi thô với chuỗi đã cắt: lệch nghĩa là có khoảng trắng thừa.
  for (const name of ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_HOST', 'SENDER_EMAIL', 'REPLY_TO']) {
    if (raw(name) && raw(name) !== raw(name).trim()) {
      warnings.push(`${name} có khoảng trắng hoặc xuống dòng thừa — đã tự cắt bỏ.`);
    }
  }

  if (isBrevo && user && !/@smtp-brevo\.com$/i.test(user) && !PLACEHOLDER.test(user)) {
    warnings.push(
      `EMAIL_USER = "${user}" không có dạng xxx@smtp-brevo.com. SMTP login của Brevo ` +
        'khác với email đăng nhập tài khoản — kiểm tra lại ở Brevo → bánh răng (Settings) → SMTP & API.',
    );
  }

  if (!/@/.test(sender)) {
    problems.push(`SENDER_EMAIL = "${sender}" không chứa địa chỉ email hợp lệ.`);
  } else if (PLACEHOLDER.test(sender)) {
    warnings.push(
      `SENDER_EMAIL = "${sender}" vẫn trỏ tới tên miền mẫu. Địa chỉ gửi phải thuộc ` +
        'tên miền đã xác thực trong Brevo, nếu không email sẽ bị từ chối hoặc vào spam.',
    );
  }

  // Địa chỉ gửi là no-reply@ và tên miền gốc không có hộp thư (không có MX),
  // nên người nhận bấm "Trả lời" là thư bị trả lại — trong khi thư mời doanh
  // nghiệp lại mời họ phản hồi. REPLY_TO chuyển câu trả lời tới hộp thư có người đọc.
  if (!replyTo) {
    warnings.push(
      'Chưa đặt REPLY_TO. Người nhận bấm "Trả lời" sẽ gửi về địa chỉ no-reply không có ' +
        'hộp thư và bị trả lại. Đặt REPLY_TO bằng một hộp thư có người đọc.',
    );
  } else if (!/@/.test(replyTo)) {
    problems.push(`REPLY_TO = "${replyTo}" không chứa địa chỉ email hợp lệ.`);
  }

  if (!/@/.test(securitySender)) {
    problems.push(`SECURITY_SENDER_EMAIL = "${securitySender}" không chứa địa chỉ email hợp lệ.`);
  }

  // Thiếu hai biến này thì thư vẫn gửi được, nhưng mất hai lớp bảo vệ uy tín:
  // nút huỷ nhận một chạm (RFC 8058) và Circuit Breaker đọc tín hiệu bounce/spam.
  if (!val('API_PUBLIC_URL')) {
    warnings.push(
      'Chưa đặt API_PUBLIC_URL (địa chỉ public của backend). Thư gợi ý sẽ thiếu header ' +
        'List-Unsubscribe một chạm mà Gmail yêu cầu với người gửi số lượng lớn.',
    );
  }
  if (!val('BREVO_WEBHOOK_TOKEN')) {
    warnings.push(
      'Chưa đặt BREVO_WEBHOOK_TOKEN. Webhook /webhooks/brevo sẽ từ chối mọi sự kiện, nên ' +
        'Circuit Breaker chỉ thấy lỗi SMTP trực tiếp, không thấy spam/hard bounce.',
    );
  }

  if (port !== 587 && port !== 465 && port !== 2525) {
    warnings.push(`EMAIL_PORT = ${port} không phải cổng Brevo hỗ trợ (587, 465 hoặc 2525).`);
  }

  // Mọi link trong email (đặt lại mật khẩu, xem việc làm) đều dựng từ origin này.
  // Trên production mà vẫn là localhost thì thư vẫn gửi đi bình thường nhưng
  // người nhận bấm vào link chỉ mở được trên máy của chính họ — hỏng lặng lẽ.
  const origin = frontendOrigin();
  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(origin)) {
    warnings.push(
      `Link trong email đang trỏ tới "${origin}". Đặt FRONTEND_URL bằng địa chỉ ` +
        'thật của website, nếu không người nhận bấm vào link sẽ không mở được.',
    );
  }

  return {
    host,
    port,
    user,
    pass,
    sender,
    securitySender,
    replyTo,
    configured: problems.length === 0,
    problems,
    warnings,
  };
};

/** Chỉ ghi mỗi cảnh báo một lần, tránh spam log ở mỗi lần gửi. */
const loggedNotes = new Set();
const logOnce = (level, text) => {
  if (loggedNotes.has(text)) return;
  loggedNotes.add(text);
  console[level](`[Email] ${text}`);
};

/** Cấu hình đã che khoá bí mật — an toàn để trả ra /health và trang admin. */
const getEmailConfig = () => {
  const { host, port, user, pass, sender, securitySender, replyTo, configured, problems, warnings } =
    readEmailConfig();
  return {
    configured,
    host,
    port,
    // Che gần hết khoá: đủ để đối chiếu, không đủ để dùng lại
    user: user ? `${user.slice(0, 3)}***@${user.split('@')[1] || '?'}` : '',
    keyPrefix: pass ? `${pass.slice(0, 9)}...` : '',
    sender,
    securitySender,
    replyTo,
    linkOrigin: frontendOrigin(),
    problems,
    warnings,
  };
};

const initTransporter = async () => {
  if (transporter) return transporter;

  const cfg = readEmailConfig();
  cfg.problems.forEach((p) => logOnce('error', p));
  cfg.warnings.forEach((w) => logOnce('warn', w));

  if (!cfg.configured) {
    return null;
  }

  try {
    const isSecure = cfg.port === 465;

    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: isSecure,
      auth: { user: cfg.user, pass: cfg.pass },
      ...(isSecure ? {} : { requireTLS: true }),
      // Giữ kết nối mở và dùng lại. Không có pool thì import trăm sinh viên là
      // trăm lần bắt tay TCP + TLS + AUTH liên tiếp — dễ bị Brevo ghìm tốc độ.
      // Vài kết nối song song là đủ; mở nhiều hơn chỉ dồn tải sang Brevo.
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    });

    console.log(`[Email] Đã khởi tạo SMTP transporter (${cfg.host}:${cfg.port}).`);
    return transporter;
  } catch (error) {
    console.error('[Email] Lỗi khởi tạo SMTP transporter:', error.message);
    return null;
  }
};

/**
 * Bỏ transporter hiện tại để lần gửi sau dựng lại (phòng khi biến môi trường
 * vừa sửa). Phải đóng pool trước, không thì các kết nối cũ treo lại mãi.
 */
const resetTransporter = () => {
  if (transporter) {
    try {
      transporter.close();
    } catch {
      /* đã đóng sẵn */
    }
  }
  transporter = null;
};

/**
 * Gắn những gì thư nào cũng cần, thay vì lặp lại ở từng hàm:
 *   - `from` mặc định là địa chỉ gửi đã cấu hình;
 *   - `replyTo` (nếu đặt REPLY_TO) để câu trả lời tới hộp thư có người đọc;
 *   - phần văn bản thuần dựng từ HTML (thư chỉ có HTML bị bộ lọc rác trừ điểm).
 */
const deliver = (t, { html, text, from, ...rest }) => {
  const { sender, replyTo } = readEmailConfig();
  return t.sendMail({
    from: from || sender,
    ...(replyTo ? { replyTo } : {}),
    ...rest,
    html,
    text: text || htmlToText(html),
  });
};

/**
 * Bắt tay thật với máy chủ SMTP để biết thông tin đăng nhập có dùng được không.
 * Dùng cho /health?email=1 và nút kiểm tra ở trang quản trị.
 */
const verifyEmailConnection = async () => {
  const cfg = readEmailConfig();
  if (!cfg.configured) {
    return { ok: false, error: cfg.problems.join(' '), problems: cfg.problems };
  }

  try {
    const t = await initTransporter();
    if (!t) return { ok: false, error: 'Không khởi tạo được SMTP transporter.' };
    await t.verify();
    return { ok: true, host: cfg.host, port: cfg.port, warnings: cfg.warnings };
  } catch (error) {
    // Buộc dựng lại ở lần sau, phòng khi biến môi trường vừa được sửa
    resetTransporter();
    return { ok: false, error: describeSmtpError(error), warnings: cfg.warnings };
  }
};

/** Dịch mã lỗi SMTP sang câu chỉ rõ cần sửa gì. */
const describeSmtpError = (error) => {
  const msg = String(error?.message || error);
  const code = error?.responseCode;

  if (code === 535 || /535/.test(msg)) {
    return (
      `SMTP từ chối thông tin đăng nhập (535). Ba nguyên nhân thường gặp: ` +
      `(1) EMAIL_PASS là API key "xkeysib-" thay vì SMTP key "xsmtpsib-"; ` +
      `(2) khoá dính khoảng trắng khi copy; ` +
      `(3) EMAIL_USER dùng email tài khoản thay vì SMTP login dạng xxx@smtp-brevo.com. ` +
      `Lỗi gốc: ${msg}`
    );
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/.test(msg)) {
    return `Không kết nối được tới máy chủ SMTP. Kiểm tra EMAIL_HOST và EMAIL_PORT. Lỗi gốc: ${msg}`;
  }
  if (code === 550 || /550|not authorized|unrecognized/i.test(msg)) {
    return (
      `Máy chủ từ chối địa chỉ gửi. SENDER_EMAIL phải thuộc tên miền đã xác thực ` +
      `trong Brevo (Settings → Senders, domains, IPs). Lỗi gốc: ${msg}`
    );
  }
  return msg;
};

/** Lỗi do kết nối/đăng nhập: dựng lại transporter ở lần sau (biến môi trường có thể vừa sửa). */
const CONNECTION_ERROR = /535|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAUTH/;

// ─── Cửa gửi duy nhất ────────────────────────────────────────────────────────

const governor = require('./mail/governor');
const outbox = require('./mail/outbox');
const { LANES } = require('./mail/policy');
const { unsubscribeHeaders } = require('./mail/unsubscribe');

const normalizeAddr = (a) => String(a || '').toLowerCase().trim();

/**
 * MỌI lá thư đều đi qua đây:
 *   1. lọc danh sách chặn (trừ P0 — người dùng tự yêu cầu mã thì vẫn gửi);
 *   2. xin suất ở governor: quota theo làn, nhịp gửi, Circuit Breaker;
 *   3. gửi; hỏng thì trả lại suất và báo lỗi SMTP cho breaker.
 *
 * Không ném lỗi — trả về kết quả để người gọi tự quyết:
 *   { sent: true, messageId, recipients, suppressed }
 *   { sent: false, deferred: true, error }   chưa tới lượt / hết quota / breaker ngắt
 *   { sent: false, suppressed: true, error } mọi người nhận đều bị chặn
 *   { sent: false, shared: true, error }     chưa cấu hình SMTP
 *   { sent: false, error, code }             SMTP từ chối
 */
const dispatch = async ({ lane, kind, to, subject, html, text, from, headers, importBatchId }) => {
  const t = await initTransporter();
  if (!t) {
    return { sent: false, shared: true, error: readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.' };
  }

  let recipients = [...new Set([].concat(to).map(normalizeAddr).filter(Boolean))];
  let suppressed = [];

  if (lane !== LANES.P0) {
    let blocked;
    try {
      blocked = await governor.suppressedAmong(recipients);
    } catch (e) {
      return { sent: false, deferred: true, error: `Không đọc được danh sách chặn: ${e.message}` };
    }
    suppressed = recipients.filter((r) => blocked.has(r)).map((email) => ({ email, reason: blocked.get(email) }));
    recipients = recipients.filter((r) => !blocked.has(r));
    if (!recipients.length) {
      return {
        sent: false,
        suppressed: true,
        suppressedList: suppressed,
        error: `Địa chỉ nằm trong danh sách chặn (${suppressed.map((s) => s.reason).join(', ')}).`,
      };
    }
  }

  const slot = await governor.reserve(lane, recipients.length);
  if (!slot.ok) return { sent: false, deferred: true, error: slot.reason, retryAt: slot.retryAt };

  try {
    const info = await deliver(t, {
      from,
      to: recipients.length === 1 ? recipients[0] : recipients,
      subject,
      html,
      text,
      ...(headers && Object.keys(headers).length ? { headers } : {}),
    });
    await governor.recordSent({ lane, kind, recipients, messageId: info.messageId, importBatchId });
    return {
      sent: true,
      messageId: info.messageId,
      rejected: info.rejected || [],
      recipients,
      suppressed,
    };
  } catch (error) {
    await governor.release(slot);
    await governor.recordSmtpError({ error, lane, kind, recipients });
    if (CONNECTION_ERROR.test(`${error?.code || ''} ${error?.responseCode || ''} ${error?.message || ''}`)) {
      resetTransporter();
    }
    return { sent: false, error: describeSmtpError(error), code: error?.responseCode };
  }
};

/** P0: gửi ngay, ném lỗi nếu hỏng (luồng đăng ký/quên mật khẩu cần báo cho người dùng). */
const sendSecurityEmail = async ({ to, subject, html, kind }) => {
  const r = await dispatch({
    lane: LANES.P0,
    kind,
    to,
    subject,
    html,
    from: readEmailConfig().securitySender,
  });
  if (!r.sent) {
    console.error(`[Email/P0] Lỗi gửi ${kind} tới ${to}: ${r.error}`);
    throw new Error(r.error);
  }
  console.log(`[Email/P0] Đã gửi ${kind} tới ${to} (MessageID: ${r.messageId})`);
  return r;
};

/**
 * Gửi một thư bất kỳ theo làn chỉ định (mặc định P0). Ném lỗi nếu không gửi được.
 * Thư hàng loạt KHÔNG dùng hàm này — xếp vào outbox để đi đúng nhịp làn P2.
 */
const sendEmail = async ({ to, subject, html, lane = LANES.P0, kind = 'generic' }) => {
  const r = await dispatch({ lane, kind, to, subject, html });
  if (!r.sent) {
    console.error(`[Email] Lỗi gửi email tới ${to}: ${r.error}`);
    throw new Error(r.error);
  }
  console.log(`[Email] Đã gửi email tới ${to} (MessageID: ${r.messageId})`);
  return r;
};

// ─── P0 · Bảo mật ────────────────────────────────────────────────────────────

/** Gửi mã 6 số để đặt lại mật khẩu. */
const sendPasswordResetEmail = async ({ to, fullName, code, minutes }) => {
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderPasswordReset({ tpl, fullName, to, code, minutes });
  return sendSecurityEmail({ to, subject, html, kind: 'password_reset' });
};

/** Gửi mã 6 số để xác thực email khi đăng ký lần đầu. */
const sendVerificationEmail = async ({ to, fullName, code, minutes }) => {
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderVerifyEmail({ tpl, fullName, to, code, minutes });
  return sendSecurityEmail({ to, subject, html, kind: 'verify_email' });
};

// ─── P1 · Thư mời tài khoản import ───────────────────────────────────────────

/**
 * Báo sinh viên rằng admin đã tạo sẵn tài khoản, kèm mật khẩu tạm thời.
 *
 * @param {string[]} [to]  Địa chỉ nhận. Mặc định là email đăng nhập. Gửi cả email
 *   trường thì hai địa chỉ nằm chung MỘT lá thư — hai lá riêng sẽ phải mang cùng
 *   một mật khẩu, mà lá thứ hai gửi hỏng rồi thử lại là sinh ra mật khẩu khác.
 * @param {'personal'|'school'|'both'} [mode]  'school' = thư gửi bù chỉ tới email
 *   trường, kèm lời nhắc mật khẩu ở thư trước không còn dùng được.
 *
 * Không ném: worker gửi hàng loạt, một địa chỉ hỏng không được làm dừng cả hàng
 * đợi. `deferred` nghĩa là chưa tới lượt (quota/nhịp/breaker) — không phải lỗi
 * của tài khoản này.
 */
const sendAccountCreatedEmail = async ({ user, password, to, mode }) => {
  const recipients = Array.isArray(to) && to.length ? to : [user.email];
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderAccountCreated({
    tpl,
    user,
    password,
    mode,
    frontendUrl: frontendOrigin(),
  });

  const r = await dispatch({
    lane: LANES.P1,
    kind: 'welcome_student',
    to: recipients,
    subject,
    html,
    importBatchId: user.importBatchId,
  });
  if (r.sent) {
    console.log(`[Email/P1] Đã gửi thông tin tài khoản cho ${r.recipients.join(', ')} (MessageID: ${r.messageId})`);
    if (r.rejected?.length) console.warn(`[Email/P1] Máy chủ từ chối một phần người nhận: ${r.rejected.join(', ')}`);
  } else if (!r.deferred) {
    console.error(`[Email/P1] Lỗi gửi thông tin tài khoản cho ${user?.email}: ${r.error}`);
  }
  return r;
};

/** Thư mời doanh nghiệp do admin import, kèm mật khẩu đăng nhập lần đầu. */
const sendCompanyAccountCreatedEmail = async ({ user, company, password }) => {
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderCompanyAccountCreated({
    tpl,
    user,
    company,
    password,
    frontendUrl: frontendOrigin(),
  });

  const r = await dispatch({
    lane: LANES.P1,
    kind: 'welcome_employer',
    to: user.email,
    subject,
    html,
    importBatchId: user.importBatchId,
  });
  if (r.sent) {
    console.log(`[Email/P1] Đã gửi thư mời doanh nghiệp tới ${user.email} (MessageID: ${r.messageId})`);
  } else if (!r.deferred) {
    console.error(`[Email/P1] Lỗi gửi thư mời doanh nghiệp tới ${user?.email}: ${r.error}`);
  }
  return r;
};

// ─── P2 · Gợi ý, tổng hợp, nhắc hạn: chỉ XẾP HÀNG ────────────────────────────
//
// Các hàm queue* dựng nội dung ngay (dữ liệu lúc cron chạy) rồi xếp vào outbox;
// worker gửi dần trong khung 09:00–17:00, đúng trần làn P2, quá 48h thì huỷ.

// dedupeKey không kèm ngày: thư cùng loại cho cùng người nhận còn đang chờ thì
// lượt cron sau KHÔNG xếp thêm — hàng đợi không phình ra khi trần P2 chưa đủ.

const queueJobMatchEmail = async ({ user, userId, jobs }) => {
  if (!jobs?.length) return { queued: false, reason: 'Không có việc làm phù hợp' };
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderJobMatch({ tpl, user, jobs, frontendUrl: frontendOrigin() });
  return outbox.enqueue({
    kind: 'job_match',
    to: user.email,
    userId,
    subject,
    html,
    dedupeKey: `job_match:${userId || user.email}`,
    meta: { markSuggestion: true },
  });
};

const queueJobAlertEmail = async ({ target, alert, jobs, userId, alertId }) => {
  if (!jobs?.length) return { queued: false, reason: 'Không có việc làm phù hợp' };
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderJobAlert({ tpl, target, alert, jobs, frontendUrl: frontendOrigin() });
  return outbox.enqueue({
    kind: 'job_alert',
    to: target.email,
    userId,
    subject,
    html,
    dedupeKey: `job_alert:${alertId || target.email}`,
    meta: { markSuggestion: true },
  });
};

const queueEmployerDigestEmail = async ({ employer, applicants, threshold, userId }) => {
  if (!applicants?.length) return { queued: false, reason: 'Không có hồ sơ' };
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderEmployerDigest({
    tpl,
    employer,
    applicants,
    threshold,
    frontendUrl: frontendOrigin(),
  });
  return outbox.enqueue({
    kind: 'employer_digest',
    to: employer.email,
    userId,
    subject,
    html,
    dedupeKey: `employer_digest:${userId || employer.email}`,
    meta: { markDigest: true },
  });
};

const queueJobExpiringEmail = async ({ employer, jobs, days, userId }) => {
  if (!jobs?.length) return { queued: false, reason: 'Không có tin sắp hết hạn' };
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderJobExpiring({
    tpl,
    employer,
    jobs,
    days,
    frontendUrl: frontendOrigin(),
  });
  return outbox.enqueue({
    kind: 'job_expiry',
    to: employer.email,
    userId,
    subject,
    html,
    dedupeKey: `job_expiry:${userId || employer.email}`,
  });
};

/** Worker outbox gọi hàm này để gửi một thư P2 đã xếp hàng. */
const deliverOutboxItem = (item) =>
  dispatch({
    lane: LANES.P2,
    kind: item.kind,
    to: item.to,
    subject: item.subject,
    html: item.html,
    headers: unsubscribeHeaders(item.to),
  });

/**
 * Gửi NGAY thư gợi ý việc làm — chỉ dùng cho nút "Gửi email test" của admin
 * (một thư tới hộp thư vận hành). Đi làn P0 để kiểm tra cấu hình được cả khi
 * breaker đang ngắt P1/P2.
 */
const sendJobMatchEmail = async (user, matchedJobs) => {
  if (!matchedJobs?.length) return { sent: false, skipped: true };
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderJobMatch({
    tpl,
    user,
    jobs: matchedJobs,
    frontendUrl: frontendOrigin(),
  });
  const r = await dispatch({ lane: LANES.P0, kind: 'test', to: user.email, subject, html });
  if (r.sent) console.log(`[Email] Đã gửi thư thử nghiệm cho ${user.email} (MessageID: ${r.messageId})`);
  else console.error(`[Email] Lỗi gửi thư thử nghiệm cho ${user.email}: ${r.error}`);
  return r;
};

module.exports = {
  dispatch,
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendAccountCreatedEmail,
  sendCompanyAccountCreatedEmail,
  queueJobMatchEmail,
  queueJobAlertEmail,
  queueEmployerDigestEmail,
  queueJobExpiringEmail,
  deliverOutboxItem,
  sendJobMatchEmail,
  getEmailConfig,
  verifyEmailConnection,
  invalidateTemplateCache,
};
