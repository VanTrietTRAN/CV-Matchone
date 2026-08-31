/**
 * Nội dung các email hệ thống gửi đi.
 *
 * Trước đây mỗi hàm gửi tự dựng một khối HTML riêng, phần khung (tên thương hiệu,
 * màu sắc, chân thư) bị chép lại ba lần. Sửa lời văn phải vào code, sửa xong phải
 * deploy lại, và rất dễ sót một trong ba chỗ.
 *
 * Nay tách làm hai phần:
 *   - **Bố cục** nằm trong file này, một chỗ duy nhất (hàm `layout`). Không cho
 *     sửa từ giao diện để admin không làm vỡ email.
 *   - **Lời văn** nằm trong `DEFAULTS`, admin sửa được ở trang Quản trị và lưu
 *     vào database. Đổi chữ không cần deploy.
 *
 * Chỗ thay biến dùng cú pháp {{ten_bien}}. Giá trị thay vào luôn được escape HTML
 * — `keyword` là do ứng viên tự nhập, không escape thì họ chèn được thẻ HTML vào
 * chính email của mình.
 */

const BRAND_ACCENT = '#2563eb';
const RESET_ACCENT = '#7c3aed';

/** Lời văn mặc định. Admin ghi đè được từng trường một. */
const DEFAULTS = {
  brand: {
    name: 'CVMatchOne',
    tagline: 'Hệ thống tuyển dụng thông minh AI',
  },
  jobMatch: {
    subject: '[{{brand}}] Có {{count}} việc làm mới siêu phù hợp với bạn! 🎉',
    greeting: 'Chào {{name}},',
    intro:
      'Hệ thống AI vừa quét và phát hiện có {{count}} công việc mới rất phù hợp với kỹ năng và kinh nghiệm trong CV của bạn.',
    note: '💡 Độ phù hợp (AI) được tính dựa trên CV chính của bạn: {{name}}.',
    listLead: 'Dưới đây là danh sách gợi ý dành riêng cho bạn:',
    footer:
      'Bạn nhận được email này vì đã bật tính năng "Nhận email gợi ý việc làm AI". Để thay đổi tần suất hoặc tắt thông báo, vui lòng truy cập Cài đặt thông báo.',
    footerLinkLabel: 'Cài đặt thông báo',
  },
  jobAlert: {
    subject: '[{{brand}}] {{count}} việc làm mới khớp thông báo "{{keyword}}" 🔔',
    greeting: 'Chào {{name}},',
    intro: 'Có {{count}} việc làm mới khớp với thông báo việc làm bạn đã tạo:',
    footer:
      'Bạn nhận email này vì đã tạo thông báo việc làm trên {{brand}}. Quản lý hoặc tắt thông báo tại Thông báo việc làm.',
    footerLinkLabel: 'Thông báo việc làm',
  },
  passwordReset: {
    subject: '[{{brand}}] Yêu cầu đặt lại mật khẩu',
    heading: '🔑 Yêu cầu đặt lại mật khẩu',
    intro:
      'Xin chào {{name}}, chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại {{brand}}.',
    buttonLabel: 'Đặt lại mật khẩu ngay',
    note:
      '⚠️ Đường dẫn này có hiệu lực trong vòng 60 phút. Nếu bạn không đưa ra yêu cầu này, hãy bỏ qua email — mật khẩu của bạn vẫn an toàn.',
    footer: '© {{brand}} · Hỗ trợ bảo mật tài khoản tự động',
  },
};

/** Các biến dùng được trong từng mẫu — hiển thị làm gợi ý ở trang Quản trị. */
const VARIABLES = {
  jobMatch: ['brand', 'name', 'count'],
  jobAlert: ['brand', 'name', 'count', 'keyword', 'location'],
  passwordReset: ['brand', 'name'],
};

/** Nhãn tiếng Việt cho từng trường, dùng cho giao diện Quản trị. */
const FIELD_LABELS = {
  subject: 'Tiêu đề thư',
  greeting: 'Lời chào',
  intro: 'Đoạn mở đầu',
  note: 'Ghi chú nổi bật',
  listLead: 'Câu dẫn vào danh sách',
  heading: 'Tiêu đề trong thư',
  buttonLabel: 'Chữ trên nút bấm',
  footer: 'Chân thư',
  footerLinkLabel: 'Chữ của link ở chân thư',
};

const TEMPLATE_LABELS = {
  jobMatch: 'Gợi ý việc làm theo AI',
  jobAlert: 'Thông báo việc làm theo từ khoá',
  passwordReset: 'Đặt lại mật khẩu',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Thay {{bien}} bằng giá trị, có escape HTML.
 * Biến không có giá trị thì bỏ trống chứ không để nguyên dấu ngoặc.
 */
const fill = (text, vars = {}) =>
  String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    key in vars ? escapeHtml(vars[key]) : '',
  );

/** Như `fill` nhưng dùng cho tiêu đề thư — không escape vì đây là plain text. */
const fillPlain = (text, vars = {}) =>
  String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    key in vars ? String(vars[key] ?? '') : '',
  );

/** Gộp giá trị admin lưu lên trên mặc định. Trường trống coi như dùng mặc định. */
const mergeTemplates = (stored) => {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  if (!stored || typeof stored !== 'object') return out;

  for (const group of Object.keys(out)) {
    const from = stored[group];
    if (!from || typeof from !== 'object') continue;
    for (const field of Object.keys(out[group])) {
      const v = from[field];
      if (typeof v === 'string' && v.trim()) out[group][field] = v;
    }
  }
  return out;
};

/**
 * Khung HTML dùng chung cho mọi email — thay cho ba bản sao trước đây.
 */
const layout = ({ brand, accent = BRAND_ACCENT, bodyHtml, footerHtml }) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
    <div style="text-align:center;padding:20px 0;">
      <h1 style="color:${accent};margin:0;">${escapeHtml(brand.name)}</h1>
      <p style="color:#64748b;margin-top:5px;">${escapeHtml(brand.tagline)}</p>
    </div>
    <div style="padding:20px;background:#fff;border-radius:8px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);">
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="font-size:13px;color:#94a3b8;text-align:center;">${footerHtml}</p>
    </div>
  </div>`;

/** Thẻ một tin tuyển dụng trong danh sách. */
const jobCard = ({ title, companyName, location, salary, tagsHtml, scoreLabel, score, ctaUrl }) => `
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
    <h3 style="margin:0 0 6px;color:#1e40af;font-size:18px;">${escapeHtml(title)}</h3>
    <p style="margin:4px 0;color:#475569;"><strong>Công ty:</strong> ${escapeHtml(companyName || 'Đang cập nhật')}</p>
    <p style="margin:4px 0;color:#475569;"><strong>Địa điểm:</strong> ${escapeHtml(location || 'Đang cập nhật')}</p>
    ${salary ? `<p style="margin:4px 0;color:#475569;"><strong>Mức lương:</strong> ${escapeHtml(salary)}</p>` : ''}
    ${tagsHtml || ''}
    <p style="margin:8px 0 0;">
      <span style="display:inline-block;background:#dcfce7;color:#166534;padding:4px 12px;border-radius:999px;font-weight:bold;font-size:14px;">
        ${escapeHtml(scoreLabel)}: ${escapeHtml(score)}%
      </span>
    </p>
    <div style="margin-top:16px;">
      <a href="${ctaUrl}" style="background:#2563eb;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:500;">Xem chi tiết &amp; Ứng tuyển</a>
    </div>
  </div>`;

const highlight = (html, accent = BRAND_ACCENT) => `
  <p style="color:#475569;font-size:14px;background:#f1f5f9;padding:10px;border-radius:6px;border-left:4px solid ${accent};">
    ${html}
  </p>`;

/** Email gợi ý việc làm theo AI. */
const renderJobMatch = ({ tpl, user, jobs, frontendUrl }) => {
  const t = tpl.jobMatch;
  const vars = { brand: tpl.brand.name, name: user.fullName || 'bạn', count: jobs.length };

  const jobsHtml = jobs
    .map((job) =>
      jobCard({
        title: job.title,
        companyName: job.companyName,
        location: job.location,
        scoreLabel: 'Độ phù hợp (AI)',
        score: job.previewScore,
        ctaUrl: `${frontendUrl}/candidate/matches`,
      }),
    )
    .join('');

  const footerLink = `<a href="${frontendUrl}/candidate/email-settings" style="color:#2563eb;">${escapeHtml(
    fillPlain(t.footerLinkLabel, vars),
  )}</a>`;

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;">${fill(t.greeting, vars)}</h2>
        <p>${fill(t.intro, vars)}</p>
        ${t.note ? highlight(`<em>${fill(t.note, vars)}</em>`) : ''}
        <p>${fill(t.listLead, vars)}</p>
        <div style="margin-top:24px;">${jobsHtml}</div>`,
      footerHtml: `${fill(t.footer, vars)}<br/>${footerLink}`,
    }),
  };
};

/** Email thông báo việc làm theo từ khoá. */
const renderJobAlert = ({ tpl, target, alert, jobs, frontendUrl }) => {
  const t = tpl.jobAlert;
  const vars = {
    brand: tpl.brand.name,
    name: target.fullName || 'bạn',
    count: jobs.length,
    keyword: alert.keyword,
    location: alert.location || 'Tất cả',
  };

  const jobsHtml = jobs
    .map((job) => {
      const tagsHtml = (job.matchedBy || [])
        .map(
          (m) =>
            `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;padding:2px 10px;border-radius:999px;font-size:12px;margin:2px 4px 2px 0;">✓ ${escapeHtml(
              m,
            )}</span>`,
        )
        .join('');
      return jobCard({
        title: job.title,
        companyName: job.companyName,
        location: job.location,
        salary: job.salary,
        tagsHtml: tagsHtml ? `<div style="margin:8px 0;">${tagsHtml}</div>` : '',
        scoreLabel: 'Độ phù hợp',
        score: job.finalScore,
        ctaUrl: `${frontendUrl}/candidate/jobs/${job.id}`,
      });
    })
    .join('');

  const criteria = `Từ khoá: <strong>${escapeHtml(vars.keyword)}</strong> &nbsp;•&nbsp; Địa điểm: <strong>${escapeHtml(
    vars.location,
  )}</strong>`;

  const footerLink = `<a href="${frontendUrl}/candidate/job-alerts" style="color:#2563eb;">${escapeHtml(
    fillPlain(t.footerLinkLabel, vars),
  )}</a>`;

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;">${fill(t.greeting, vars)}</h2>
        <p>${fill(t.intro, vars)}</p>
        ${highlight(`🔎 ${criteria}`)}
        <div style="margin-top:24px;">${jobsHtml}</div>`,
      footerHtml: `${fill(t.footer, vars)}<br/>${footerLink}`,
    }),
  };
};

/** Email đặt lại mật khẩu. */
const renderPasswordReset = ({ tpl, fullName, to, resetUrl }) => {
  const t = tpl.passwordReset;
  const vars = { brand: tpl.brand.name, name: fullName || to };

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      accent: RESET_ACCENT,
      bodyHtml: `
        <h2 style="margin-top:0;color:#1e1b4b;font-size:18px;">${fill(t.heading, vars)}</h2>
        <p style="color:#334155;font-size:14px;line-height:1.6;">${fill(t.intro, vars)}</p>
        <div style="text-align:center;margin:25px 0;">
          <a href="${resetUrl}" style="background:${RESET_ACCENT};color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">
            ${fill(t.buttonLabel, vars)}
          </a>
        </div>
        ${t.note ? highlight(`<em>${fill(t.note, vars)}</em>`, RESET_ACCENT) : ''}`,
      footerHtml: fill(t.footer, vars),
    }),
  };
};

/** Dữ liệu mẫu để xem trước ở trang Quản trị — không đụng tới database. */
const SAMPLE = {
  user: { fullName: 'Nguyễn Văn A', email: 'ung-vien@example.com' },
  jobs: [
    {
      id: 'sample1',
      title: 'Lập trình viên Backend (Node.js)',
      companyName: 'Công ty TNHH Mẫu',
      location: 'Đà Nẵng',
      salary: '15 - 25 triệu',
      previewScore: 92,
      finalScore: 92,
      matchedBy: ['Node.js', 'MongoDB'],
    },
    {
      id: 'sample2',
      title: 'Kỹ sư Dữ liệu',
      companyName: 'Tập đoàn Ví Dụ',
      location: 'Hà Nội',
      salary: 'Thoả thuận',
      previewScore: 78,
      finalScore: 78,
      matchedBy: ['Python'],
    },
  ],
  alert: { keyword: 'backend', location: 'Đà Nẵng' },
  resetUrl: 'https://example.com/reset-password?token=mau-thu-nghiem',
};

/** Dựng bản xem trước cho một mẫu bất kỳ. */
const renderPreview = (key, tpl, frontendUrl) => {
  if (key === 'jobMatch') {
    return renderJobMatch({ tpl, user: SAMPLE.user, jobs: SAMPLE.jobs, frontendUrl });
  }
  if (key === 'jobAlert') {
    return renderJobAlert({
      tpl,
      target: SAMPLE.user,
      alert: SAMPLE.alert,
      jobs: SAMPLE.jobs,
      frontendUrl,
    });
  }
  if (key === 'passwordReset') {
    return renderPasswordReset({
      tpl,
      fullName: SAMPLE.user.fullName,
      to: SAMPLE.user.email,
      resetUrl: SAMPLE.resetUrl,
    });
  }
  throw new Error(`Không có mẫu email tên "${key}"`);
};

module.exports = {
  DEFAULTS,
  VARIABLES,
  FIELD_LABELS,
  TEMPLATE_LABELS,
  mergeTemplates,
  renderJobMatch,
  renderJobAlert,
  renderPasswordReset,
  renderPreview,
  escapeHtml,
};
