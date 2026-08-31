const nodemailer = require('nodemailer');
const { frontendOrigin } = require('../utils/frontendUrl');

let transporter = null;

const DEFAULT_SENDER = 'CVMatchOne <no-reply@cvmatchone.com>';

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

    const frontendUrl = frontendOrigin();
    const sender = readEmailConfig().sender;

    const jobsHtml = matchedJobs.map(job => `
      <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; background-color: #f8fafc;">
        <h3 style="margin-top: 0; color: #1e40af; font-size: 18px;">${job.title}</h3>
        <p style="margin: 4px 0; color: #475569;"><strong>Công ty:</strong> ${job.companyName || 'Công ty bảo mật'}</p>
        <p style="margin: 4px 0; color: #475569;"><strong>Địa điểm:</strong> ${job.location || 'Chưa cập nhật'}</p>
        <p style="margin: 8px 0 0 0;">
          <span style="display: inline-block; background-color: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 999px; font-weight: bold; font-size: 14px;">
            Độ phù hợp (AI): ${job.previewScore}%
          </span>
        </p>
        <div style="margin-top: 16px;">
          <a href="${frontendUrl}/candidate/matches" style="background-color: #2563eb; color: #ffffff; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: 500;">Xem chi tiết & Ứng tuyển</a>
        </div>
      </div>
    `).join('');

    const mailOptions = {
      from: sender,
      to: user.email,
      subject: `[CVMatchOne] Có ${matchedJobs.length} việc làm mới siêu phù hợp với bạn! 🎉`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; padding: 20px 0;">
            <h1 style="color: #2563eb; margin: 0;">CVMatchOne</h1>
            <p style="color: #64748b; margin-top: 5px;">Hệ thống tuyển dụng thông minh AI</p>
          </div>
          
          <div style="padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <h2 style="margin-top: 0;">Chào ${user.fullName || 'bạn'},</h2>
            <p>Hệ thống AI của chúng tôi vừa quét và phát hiện có <strong>${matchedJobs.length}</strong> công việc mới rất phù hợp với kỹ năng và kinh nghiệm trong CV của bạn.</p>
            <p style="color: #475569; font-size: 14px; background-color: #f1f5f9; padding: 10px; border-radius: 6px; border-left: 4px solid #3b82f6;">
              💡 <em>Độ phù hợp (AI) được tính dựa trên CV chính của bạn: <strong>${user.fullName}</strong>.</em>
            </p>
            <p>Dưới đây là danh sách gợi ý dành riêng cho bạn:</p>
            
            <div style="margin-top: 24px;">
              ${jobsHtml}
            </div>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 13px; color: #94a3b8; text-align: center;">
              Bạn nhận được email này vì đã bật tính năng "Nhận email gợi ý việc làm AI".<br/>
              Để thay đổi tần suất hoặc tắt thông báo, vui lòng truy cập <a href="${frontendUrl}/candidate/email-settings" style="color: #2563eb;">Cài đặt thông báo</a>.
            </p>
          </div>
        </div>
      `,
    };

    const info = await t.sendMail(mailOptions);
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

    const frontendUrl = frontendOrigin();
    const sender = readEmailConfig().sender;

    const jobsHtml = matchedJobs
      .map((job) => {
        const tags = (job.matchedBy || [])
          .map(
            (m) =>
              `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;padding:2px 10px;border-radius:999px;font-size:12px;margin:2px 4px 2px 0;">✓ ${m}</span>`
          )
          .join('');
        return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
        <h3 style="margin:0 0 6px;color:#1e40af;font-size:18px;">${job.title}</h3>
        <p style="margin:4px 0;color:#475569;"><strong>Công ty:</strong> ${job.companyName || 'Đang cập nhật'}</p>
        <p style="margin:4px 0;color:#475569;"><strong>Địa điểm:</strong> ${job.location || 'Đang cập nhật'}</p>
        ${job.salary ? `<p style="margin:4px 0;color:#475569;"><strong>Mức lương:</strong> ${job.salary}</p>` : ''}
        <div style="margin:8px 0;">${tags}</div>
        <p style="margin:8px 0 0;">
          <span style="display:inline-block;background:#dcfce7;color:#166534;padding:4px 12px;border-radius:999px;font-weight:bold;font-size:14px;">
            Độ phù hợp: ${job.finalScore}%
          </span>
        </p>
        <div style="margin-top:16px;">
          <a href="${frontendUrl}/candidate/jobs/${job.id}" style="background:#2563eb;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:500;">Xem chi tiết & Ứng tuyển</a>
        </div>
      </div>`;
      })
      .join('');

    const criteria = [
      `Từ khoá: <strong>${alert.keyword}</strong>`,
      alert.location ? `Địa điểm: <strong>${alert.location}</strong>` : 'Địa điểm: <strong>Tất cả</strong>',
    ].join(' &nbsp;•&nbsp; ');

    const mailOptions = {
      from: sender,
      to: target.email,
      subject: `[CVMatchOne] ${matchedJobs.length} việc làm mới khớp thông báo "${alert.keyword}" 🔔`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
          <div style="text-align:center;padding:20px 0;">
            <h1 style="color:#2563eb;margin:0;">CVMatchOne</h1>
            <p style="color:#64748b;margin-top:5px;">Hệ thống tuyển dụng thông minh AI</p>
          </div>
          <div style="padding:20px;background:#fff;border-radius:8px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);">
            <h2 style="margin-top:0;">Chào ${target.fullName || 'bạn'},</h2>
            <p>Có <strong>${matchedJobs.length}</strong> việc làm mới khớp với thông báo việc làm bạn đã tạo:</p>
            <p style="color:#475569;font-size:14px;background:#f1f5f9;padding:10px;border-radius:6px;border-left:4px solid #3b82f6;">
              🔎 ${criteria}
            </p>
            <div style="margin-top:24px;">${jobsHtml}</div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="font-size:13px;color:#94a3b8;text-align:center;">
              Bạn nhận email này vì đã tạo thông báo việc làm trên CVMatchOne.<br/>
              Quản lý hoặc tắt thông báo tại <a href="${frontendUrl}/candidate/job-alerts" style="color:#2563eb;">Thông báo việc làm</a>.
            </p>
          </div>
        </div>`,
    };

    const info = await t.sendMail(mailOptions);
    console.log(`[Email] Đã gửi thông báo việc làm cho ${target.email} (từ khoá: ${alert.keyword}, MessageID: ${info.messageId})`);
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

const sendPasswordResetEmail = async ({ to, fullName, resetUrl }) => {
  const subject = '[CVMatchOne] Yêu cầu Đặt lại Mật khẩu';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px;">
        <h1 style="color: #6d28d9; margin: 0;">CVMatchOne</h1>
        <p style="color: #64748b; margin-top: 4px; font-size: 14px;">Hệ thống Tuyển dụng Thông minh AI</p>
      </div>
      
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; border-left: 4px solid #7c3aed;">
        <h2 style="margin-top: 0; color: #1e1b4b; font-size: 18px;">🔑 Yêu cầu Đặt lại Mật khẩu</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Xin chào <strong>${fullName || to}</strong>,<br/>
          Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại CVMatchOne.
        </p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetUrl}" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);">
            Đặt lại Mật khẩu Ngay
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          ⚠️ <em>Đường dẫn này có hiệu lực trong vòng <strong>60 phút</strong>. Nếu bạn không đưa ra yêu cầu này, vui lòng bỏ qua email và mật khẩu của bạn vẫn an toàn.</em>
        </p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        © CVMatchOne System · Hỗ trợ bảo mật tài khoản tự động
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html });
};

module.exports = {
  sendJobMatchEmail,
  sendJobAlertEmail,
  sendEmail,
  sendPasswordResetEmail,
  getEmailConfig,
  verifyEmailConnection,
};
