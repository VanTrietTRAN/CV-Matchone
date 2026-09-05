const nodemailer = require('nodemailer');
const { frontendOrigin } = require('../utils/frontendUrl');
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
  for (const name of ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_HOST', 'SENDER_EMAIL']) {
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
  const { host, port, user, pass, sender, configured, problems, warnings } = readEmailConfig();
  return {
    configured,
    host,
    port,
    // Che gần hết khoá: đủ để đối chiếu, không đủ để dùng lại
    user: user ? `${user.slice(0, 3)}***@${user.split('@')[1] || '?'}` : '',
    keyPrefix: pass ? `${pass.slice(0, 9)}...` : '',
    sender,
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
    });

    console.log(`[Email] Đã khởi tạo SMTP transporter (${cfg.host}:${cfg.port}).`);
    return transporter;
  } catch (error) {
    console.error('[Email] Lỗi khởi tạo SMTP transporter:', error.message);
    return null;
  }
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
    transporter = null;
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

const sendJobMatchEmail = async (user, matchedJobs) => {
  try {
    const t = await initTransporter();
    if (!t) throw new Error(readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.');

    if (!matchedJobs || matchedJobs.length === 0) return { sent: false, skipped: true };

    const tpl = await loadTemplates();
    const { subject, html } = templates.renderJobMatch({
      tpl,
      user,
      jobs: matchedJobs,
      frontendUrl: frontendOrigin(),
    });

    const info = await t.sendMail({
      from: readEmailConfig().sender,
      to: user.email,
      subject,
      html,
    });
    console.log(`[Email] Đã gửi gợi ý việc làm cho ${user.email} (MessageID: ${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    // Trả kết quả thay vì ném: cron duyệt qua nhiều người, một địa chỉ hỏng
    // không được phép làm dừng cả lượt gửi. Nhưng người gọi phải biết là hỏng —
    // bản cũ nuốt lỗi nên nút "Gửi email test" của admin luôn báo thành công.
    const reason = describeSmtpError(error);
    console.error(`[Email] Lỗi gửi gợi ý việc làm cho ${user.email}: ${reason}`);
    return { sent: false, error: reason };
  }
};

const sendJobAlertEmail = async (target, alert, matchedJobs) => {
  try {
    const t = await initTransporter();
    if (!t) throw new Error(readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.');
    if (!matchedJobs || matchedJobs.length === 0) return { sent: false, skipped: true };

    const tpl = await loadTemplates();
    const { subject, html } = templates.renderJobAlert({
      tpl,
      target,
      alert,
      jobs: matchedJobs,
      frontendUrl: frontendOrigin(),
    });

    const info = await t.sendMail({
      from: readEmailConfig().sender,
      to: target.email,
      subject,
      html,
    });
    console.log(
      `[Email] Đã gửi thông báo việc làm cho ${target.email} (từ khoá: ${alert.keyword}, MessageID: ${info.messageId})`,
    );
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    const reason = describeSmtpError(error);
    console.error(`[Email] Lỗi gửi thông báo việc làm cho ${target?.email}: ${reason}`);
    return { sent: false, error: reason };
  }
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    const t = await initTransporter();
    if (!t) throw new Error(readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.');

    const sender = readEmailConfig().sender;
    const mailOptions = {
      from: sender,
      to,
      subject,
      html,
    };

    const info = await t.sendMail(mailOptions);
    console.log(`[Email Service] Đã gửi email thành công tới ${to} (MessageID: ${info.messageId})`);
    return info;
  } catch (error) {
    const reason = describeSmtpError(error);
    console.error(`[Email] Lỗi gửi email tới ${to}: ${reason}`);
    transporter = null;
    throw new Error(reason);
  }
};

/** Báo sinh viên rằng admin đã tạo sẵn tài khoản, kèm mật khẩu tạm thời. */
const sendAccountCreatedEmail = async ({ user, password }) => {
  try {
    const t = await initTransporter();
    if (!t) throw new Error(readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.');

    const tpl = await loadTemplates();
    const { subject, html } = templates.renderAccountCreated({
      tpl,
      user,
      password,
      frontendUrl: frontendOrigin(),
    });

    const info = await t.sendMail({ from: readEmailConfig().sender, to: user.email, subject, html });
    console.log(`[Email] Đã gửi thông tin tài khoản cho ${user.email} (MessageID: ${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    // Không ném: import hàng trăm sinh viên, một địa chỉ hỏng không được làm
    // dừng cả lô. Người gọi ghi lại để admin biết ai chưa nhận được thư.
    const reason = describeSmtpError(error);
    console.error(`[Email] Lỗi gửi thông tin tài khoản cho ${user?.email}: ${reason}`);
    return { sent: false, error: reason };
  }
};

/** Nhắc doanh nghiệp gia hạn các tin sắp hết hiển thị. */
const sendJobExpiringEmail = async ({ employer, jobs, days }) => {
  try {
    const t = await initTransporter();
    if (!t) throw new Error(readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.');
    if (!jobs || jobs.length === 0) return { sent: false, skipped: true };

    const tpl = await loadTemplates();
    const { subject, html } = templates.renderJobExpiring({
      tpl,
      employer,
      jobs,
      days,
      frontendUrl: frontendOrigin(),
    });

    const info = await t.sendMail({
      from: readEmailConfig().sender,
      to: employer.email,
      subject,
      html,
    });
    console.log(
      `[Email] Đã nhắc hạn ${jobs.length} tin cho ${employer.email} (MessageID: ${info.messageId})`,
    );
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    const reason = describeSmtpError(error);
    console.error(`[Email] Lỗi nhắc hạn tin cho ${employer?.email}: ${reason}`);
    return { sent: false, error: reason };
  }
};

/** Gửi mã 6 số để đặt lại mật khẩu. */
const sendPasswordResetEmail = async ({ to, fullName, code, minutes }) => {
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderPasswordReset({ tpl, fullName, to, code, minutes });
  return sendEmail({ to, subject, html });
};

/** Gửi mã 6 số để xác thực email khi đăng ký lần đầu. */
const sendVerificationEmail = async ({ to, fullName, code, minutes }) => {
  const tpl = await loadTemplates();
  const { subject, html } = templates.renderVerifyEmail({ tpl, fullName, to, code, minutes });
  return sendEmail({ to, subject, html });
};

/**
 * Email tổng hợp gửi doanh nghiệp: các hồ sơ điểm khớp cao trong ngày.
 * Trả kết quả thay vì ném, giống hai hàm digest kia — cron duyệt nhiều doanh
 * nghiệp, một địa chỉ hỏng không được làm dừng cả lượt.
 */
const sendEmployerDigestEmail = async ({ employer, applicants, threshold }) => {
  try {
    const t = await initTransporter();
    if (!t) throw new Error(readEmailConfig().problems.join(' ') || 'Chưa cấu hình được SMTP.');
    if (!applicants || applicants.length === 0) return { sent: false, skipped: true };

    const tpl = await loadTemplates();
    const { subject, html } = templates.renderEmployerDigest({
      tpl,
      employer,
      applicants,
      threshold,
      frontendUrl: frontendOrigin(),
    });

    const info = await t.sendMail({
      from: readEmailConfig().sender,
      to: employer.email,
      subject,
      html,
    });
    console.log(
      `[Email] Đã gửi tổng hợp ứng viên cho ${employer.email} (${applicants.length} hồ sơ, MessageID: ${info.messageId})`,
    );
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    const reason = describeSmtpError(error);
    console.error(`[Email] Lỗi gửi tổng hợp ứng viên cho ${employer?.email}: ${reason}`);
    return { sent: false, error: reason };
  }
};

module.exports = {
  sendJobMatchEmail,
  sendJobAlertEmail,
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendEmployerDigestEmail,
  sendJobExpiringEmail,
  sendAccountCreatedEmail,
  getEmailConfig,
  verifyEmailConnection,
  invalidateTemplateCache,
};
