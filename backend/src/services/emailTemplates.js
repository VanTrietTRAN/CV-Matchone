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

const { schoolEmailOf } = require('../utils/schoolEmail');
const { normalizeText: sharedNormalize } = require('../utils/normalizeText');

const BRAND_ACCENT = '#2563eb';
const RESET_ACCENT = '#7c3aed';

/** Lời văn mặc định. Admin ghi đè được từng trường một. */
const DEFAULTS = {
  brand: {
    name: 'CVMatchOne',
    tagline: 'Hệ thống tuyển dụng thông minh AI',
  },
  jobMatch: {
    subject: '[{{brand}}] {{count}} việc làm mới phù hợp với CV của bạn',
    greeting: 'Chào {{name}},',
    intro:
      'Dựa trên kỹ năng và kinh nghiệm trong CV của bạn, {{brand}} tìm thấy {{count}} việc làm mới phù hợp.',
    note: 'Độ phù hợp được tính dựa trên CV chính của bạn: {{name}}.',
    listLead: 'Danh sách việc làm:',
    footer:
      'Bạn nhận được email này vì đã bật tính năng "Nhận email gợi ý việc làm AI". Để thay đổi tần suất hoặc tắt thông báo, vui lòng truy cập Cài đặt thông báo.',
    footerLinkLabel: 'Cài đặt thông báo',
  },
  jobAlert: {
    subject: '[{{brand}}] {{count}} việc làm mới khớp thông báo "{{keyword}}"',
    greeting: 'Chào {{name}},',
    intro: 'Có {{count}} việc làm mới khớp với thông báo việc làm bạn đã tạo:',
    footer:
      'Bạn nhận email này vì đã tạo thông báo việc làm trên {{brand}}. Quản lý hoặc tắt thông báo tại Thông báo việc làm.',
    footerLinkLabel: 'Thông báo việc làm',
  },
  passwordReset: {
    subject: '[{{brand}}] Mã đặt lại mật khẩu: {{code}}',
    heading: 'Đặt lại mật khẩu',
    intro:
      'Xin chào {{name}}, chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại {{brand}}. Nhập mã bên dưới để đặt mật khẩu mới.',
    note:
      '⚠️ Mã có hiệu lực trong {{minutes}} phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu của bạn vẫn an toàn.',
    footer: '© {{brand}} · Hỗ trợ bảo mật tài khoản tự động',
  },
  verifyEmail: {
    subject: '[{{brand}}] Mã xác thực tài khoản: {{code}}',
    heading: 'Chào mừng bạn đến với {{brand}}',
    intro:
      'Cảm ơn bạn đã đăng ký. Nhập mã bên dưới để xác thực địa chỉ email và bắt đầu sử dụng tài khoản.',
    note:
      '⚠️ Mã có hiệu lực trong {{minutes}} phút. Nếu bạn không đăng ký tài khoản tại {{brand}}, hãy bỏ qua email này.',
    footer: '© {{brand}} · Email tự động, vui lòng không trả lời',
  },
  accountCreated: {
    subject: '[{{brand}}] Tài khoản của bạn đã sẵn sàng',
    heading: 'Chào {{name}},',
    intro:
      'Nhà trường đã tạo sẵn tài khoản {{brand}} cho bạn để tìm việc làm và thực tập phù hợp với ngành {{major}}. Đăng nhập bằng thông tin bên dưới.',
    passwordLabel: 'Mật khẩu tạm thời',
    buttonLabel: 'Đăng nhập',
    note:
      '⚠️ Đây là mật khẩu tạm thời. Hệ thống sẽ yêu cầu bạn đổi mật khẩu ngay trong lần đăng nhập đầu tiên. Không chia sẻ mật khẩu này với ai.',
    nextSteps:
      'Sau khi đăng nhập, hãy tải CV lên hoặc dùng công cụ tạo CV. AI sẽ đọc hồ sơ và gợi ý việc làm phù hợp gửi vào email của bạn.',
    schoolNote:
      'Thư này được gửi tới hộp thư sinh viên {{schoolEmail}}. Nếu trước đó bạn đã nhận thư tới {{email}}, mật khẩu trong thư đó không còn dùng được — hãy dùng mật khẩu bên dưới.',
    footer: '© {{brand}} · Email tự động, vui lòng không trả lời',
  },
  companyAccountCreated: {
    subject: '[{{brand}}] Tài khoản nhà tuyển dụng của {{company}} đã sẵn sàng',
    heading: 'Kính gửi {{company}},',
    intro:
      'Tài khoản nhà tuyển dụng của Quý công ty trên {{brand}} đã được khởi tạo. Quý công ty đăng nhập bằng thông tin bên dưới để quản lý tin tuyển dụng và hồ sơ ứng viên.',
    benefitsLead: 'Ngay sau khi đăng nhập, Quý công ty có thể:',
    // Mỗi quyền lợi cách nhau bằng dấu | — admin sửa được lời văn mà không phải
    // đụng vào HTML, vẫn ra đúng một danh sách gạch đầu dòng.
    benefits:
      'Đăng tin tuyển dụng và hiển thị tới ứng viên phù hợp|Nhận hồ sơ đã được AI chấm điểm mức độ phù hợp với mô tả công việc|Xây dựng trang giới thiệu công ty riêng, có đánh giá từ nhân sự|Toàn quyền quản lý những tin tuyển dụng do {{brand}} đăng hộ Quý công ty',
    passwordLabel: 'Mật khẩu đăng nhập lần đầu',
    buttonLabel: 'Đăng nhập',
    note:
      'Đây là mật khẩu tạm thời do hệ thống cấp. Vì lý do an toàn, hệ thống sẽ yêu cầu Quý công ty đặt mật khẩu mới ngay trong lần đăng nhập đầu tiên.',
    nextSteps:
      'Nếu Quý công ty đã có tin tuyển dụng do đội ngũ {{brand}} đăng hộ, các tin đó đã nằm sẵn trong mục Quản lý tin tuyển dụng của tài khoản này và Quý công ty có toàn quyền chỉnh sửa, gia hạn hay đóng tin.',
    support: 'Nếu cần hỗ trợ, Quý công ty có thể trả lời trực tiếp email này.',
    footer: '© {{brand}} · Nền tảng tuyển dụng ứng dụng AI',
  },
  jobExpiring: {
    subject: '[{{brand}}] {{count}} tin tuyển dụng sắp hết hạn',
    greeting: 'Chào {{name}},',
    intro:
      'Bạn có {{count}} tin tuyển dụng sẽ hết hạn hiển thị trong {{days}} ngày tới. Gia hạn để tin tiếp tục xuất hiện với ứng viên.',
    listLead: 'Các tin cần gia hạn:',
    footer:
      'Bạn nhận email này vì đang bật nhắc hạn tin tuyển dụng trên {{brand}}. Tắt nhắc nhở tại Cài đặt email.',
    footerLinkLabel: 'Cài đặt email',
  },
  employerDigest: {
    subject: '[{{brand}}] {{count}} ứng viên phù hợp vừa ứng tuyển',
    greeting: 'Chào {{name}},',
    intro:
      'Trong hôm nay có {{count}} ứng viên đạt độ phù hợp từ {{threshold}}% trở lên vừa ứng tuyển vào tin tuyển dụng của bạn.',
    listLead: 'Danh sách hồ sơ đáng chú ý:',
    footer:
      'Bạn nhận email này vì đang có tin tuyển dụng đăng trên {{brand}}. Xem toàn bộ hồ sơ tại Quản lý ứng viên.',
    footerLinkLabel: 'Quản lý ứng viên',
  },
};

/** Các biến dùng được trong từng mẫu — hiển thị làm gợi ý ở trang Quản trị. */
const VARIABLES = {
  jobMatch: ['brand', 'name', 'count'],
  jobAlert: ['brand', 'name', 'count', 'keyword', 'location'],
  passwordReset: ['brand', 'name', 'code', 'minutes'],
  verifyEmail: ['brand', 'name', 'code', 'minutes'],
  employerDigest: ['brand', 'name', 'count', 'threshold'],
  jobExpiring: ['brand', 'name', 'count', 'days'],
  accountCreated: ['brand', 'name', 'email', 'major', 'phone', 'studentId', 'schoolEmail'],
  companyAccountCreated: ['brand', 'company', 'email', 'phone', 'address'],
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
  passwordLabel: 'Nhãn ô mật khẩu',
  nextSteps: 'Hướng dẫn bước tiếp theo',
  schoolNote: 'Ghi chú trong thư gửi bù tới email trường',
  benefitsLead: 'Câu dẫn vào danh sách quyền lợi',
  benefits: 'Danh sách quyền lợi (ngăn nhau bằng dấu |)',
  support: 'Lời mời liên hệ hỗ trợ',
};

const TEMPLATE_LABELS = {
  verifyEmail: 'Xác thực email khi đăng ký',
  passwordReset: 'Đặt lại mật khẩu',
  jobMatch: 'Gợi ý việc làm cho ứng viên (12h)',
  jobAlert: 'Thông báo việc làm theo từ khoá',
  employerDigest: 'Hồ sơ phù hợp cho doanh nghiệp (15h)',
  jobExpiring: 'Nhắc hạn tin tuyển dụng',
  accountCreated: 'Tài khoản sinh viên do admin tạo',
  companyAccountCreated: 'Thư mời doanh nghiệp do admin import',
};

/**
 * Chuẩn hoá mọi chữ người dùng nhập trước khi vào thư (xem utils/normalizeText).
 * Model đã chuẩn hoá khi lưu; làm lại ở đây cho dữ liệu cũ và tên lấy từ chỗ khác.
 */
const normalizeText = (value) => String(sharedNormalize(String(value ?? '')));

const escapeRaw = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeHtml = (value) => escapeRaw(normalizeText(value));

/** Giá trị đặt trong thuộc tính href: escape cả dấu nháy để không thoát khỏi thuộc tính. */
const escapeAttr = (value) => escapeRaw(value);

/** Một đoạn đường dẫn lấy từ dữ liệu (id tin...) — mã hoá như thành phần URL. */
const seg = (value) => encodeURIComponent(String(value ?? ''));

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** Chỉ biến khai báo thật — `{{constructor}}` không được lôi Object.prototype ra. */
const varOf = (vars, key) => (Object.hasOwn(vars, key) ? vars[key] : '');

/**
 * Thay {{bien}} bằng giá trị và escape HTML CẢ phần chữ cố định của mẫu: lời
 * văn do admin sửa trên giao diện, gõ "<script>" vào mẫu thì thư phải hiện đúng
 * chữ đó chứ không thành thẻ HTML. Biến không có giá trị thì bỏ trống.
 */
const fill = (text, vars = {}) => {
  const src = String(text ?? '');
  let out = '';
  let last = 0;
  for (const m of src.matchAll(PLACEHOLDER)) {
    out += escapeHtml(src.slice(last, m.index));
    out += escapeHtml(varOf(vars, m[1]));
    last = m.index + m[0].length;
  }
  return out + escapeHtml(src.slice(last));
};

/** Như `fill` nhưng dùng cho tiêu đề thư — không escape vì đây là plain text. */
const fillPlain = (text, vars = {}) =>
  String(text ?? '').replace(PLACEHOLDER, (_, key) => normalizeText(varOf(vars, key)));

/** Số tin tối đa trong một thư, và tối đa bao nhiêu tin của cùng một công ty. */
const EMAIL_MAX_JOBS = 5;
const EMAIL_MAX_PER_COMPANY = 2;

/**
 * Chọn tin đưa vào thư từ danh sách đã sắp theo điểm.
 *
 * Thư dài hàng chục tin, mỗi tin một link theo dõi, mà phần lớn của một công ty
 * thì trông như thư quảng cáo hàng loạt — đúng kiểu bộ lọc nghi ngờ, và người
 * nhận cũng không đọc hết. Giữ vài tin điểm cao nhất, mỗi công ty tối đa hai
 * tin; phần còn lại dẫn về trang web bằng một link "xem thêm".
 */
const pickJobsForEmail = (jobs) => {
  const perCompany = new Map();
  const picked = [];
  for (const job of jobs || []) {
    if (picked.length >= EMAIL_MAX_JOBS) break;
    const key = normalizeText(job.companyName).trim().toLowerCase() || `#${job.id}`;
    const n = perCompany.get(key) || 0;
    if (n >= EMAIL_MAX_PER_COMPANY) continue;
    perCompany.set(key, n + 1);
    picked.push(job);
  }
  return { picked, remaining: (jobs?.length || 0) - picked.length };
};

const moreJobsLink = (remaining, url) =>
  remaining > 0
    ? `<p style="text-align:center;margin:8px 0 0;"><a href="${escapeAttr(url)}" style="color:#2563eb;font-weight:500;">Xem thêm ${remaining} việc làm khác trên website</a></p>`
    : '';

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
      <a href="${escapeAttr(ctaUrl)}" style="background:#2563eb;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:500;">Xem chi tiết &amp; Ứng tuyển</a>
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
  const { picked, remaining } = pickJobsForEmail(jobs);

  const jobsHtml = picked
    .map((job) =>
      jobCard({
        title: job.title,
        companyName: job.companyName,
        location: job.location,
        scoreLabel: 'Độ phù hợp (AI)',
        score: job.previewScore,
        // Trỏ thẳng vào bài đăng, không phải trang danh sách — người nhận bấm là
        // tới đúng tin đó, không phải tự đi tìm lại.
        ctaUrl: job.id ? `${frontendUrl}/candidate/jobs/${seg(job.id)}` : `${frontendUrl}/candidate/matches`,
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
        <div style="margin-top:24px;">${jobsHtml}</div>
        ${moreJobsLink(remaining, `${frontendUrl}/candidate/matches`)}`,
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
  const { picked, remaining } = pickJobsForEmail(jobs);

  const jobsHtml = picked
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
        ctaUrl: `${frontendUrl}/candidate/jobs/${seg(job.id)}`,
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
        ${highlight(criteria)}
        <div style="margin-top:24px;">${jobsHtml}</div>
        ${moreJobsLink(remaining, `${frontendUrl}/candidate/job-alerts`)}`,
      footerHtml: `${fill(t.footer, vars)}<br/>${footerLink}`,
    }),
  };
};

/** Khối hiển thị mã 6 số — to, rõ, dễ chọn để copy. */
const codeBlock = (code, accent) => `
  <div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;background:#f1f5f9;border:1px dashed ${accent};border-radius:10px;padding:16px 28px;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:${accent};">${escapeHtml(
        code,
      )}</span>
    </div>
  </div>`;

/** Email đặt lại mật khẩu — gửi mã 6 số thay cho đường dẫn. */
const renderPasswordReset = ({ tpl, fullName, to, code, minutes }) => {
  const t = tpl.passwordReset;
  const vars = { brand: tpl.brand.name, name: fullName || to, code, minutes };

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      accent: RESET_ACCENT,
      bodyHtml: `
        <h2 style="margin-top:0;color:#1e1b4b;font-size:18px;">${fill(t.heading, vars)}</h2>
        <p style="color:#334155;font-size:14px;line-height:1.6;">${fill(t.intro, vars)}</p>
        ${codeBlock(code, RESET_ACCENT)}
        ${t.note ? highlight(`<em>${fill(t.note, vars)}</em>`, RESET_ACCENT) : ''}`,
      footerHtml: fill(t.footer, vars),
    }),
  };
};

/** Email xác thực địa chỉ email khi đăng ký lần đầu. */
const renderVerifyEmail = ({ tpl, fullName, to, code, minutes }) => {
  const t = tpl.verifyEmail;
  const vars = { brand: tpl.brand.name, name: fullName || to, code, minutes };

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;font-size:18px;">${fill(t.heading, vars)}</h2>
        <p style="color:#334155;font-size:14px;line-height:1.6;">${fill(t.intro, vars)}</p>
        ${codeBlock(code, BRAND_ACCENT)}
        ${t.note ? highlight(`<em>${fill(t.note, vars)}</em>`) : ''}`,
      footerHtml: fill(t.footer, vars),
    }),
  };
};

/** Thẻ một ứng viên trong email tổng hợp gửi doanh nghiệp. */
const candidateCard = ({ fullName, headline, jobTitle, score, skills, appliedAt, ctaUrl }) => `
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
    <div style="display:block;">
      <h3 style="margin:0 0 4px;color:#1e40af;font-size:17px;">${escapeHtml(fullName || 'Ứng viên')}</h3>
      ${headline ? `<p style="margin:0 0 8px;color:#64748b;font-size:14px;">${escapeHtml(headline)}</p>` : ''}
    </div>
    <p style="margin:4px 0;color:#475569;font-size:14px;"><strong>Ứng tuyển vào:</strong> ${escapeHtml(jobTitle)}</p>
    ${appliedAt ? `<p style="margin:4px 0;color:#475569;font-size:14px;"><strong>Thời gian:</strong> ${escapeHtml(appliedAt)}</p>` : ''}
    ${
      skills && skills.length
        ? `<div style="margin:8px 0;">${skills
            .slice(0, 6)
            .map(
              (k) =>
                `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;padding:2px 10px;border-radius:999px;font-size:12px;margin:2px 4px 2px 0;">${escapeHtml(
                  k,
                )}</span>`,
            )
            .join('')}</div>`
        : ''
    }
    <p style="margin:8px 0 0;">
      <span style="display:inline-block;background:#dcfce7;color:#166534;padding:4px 12px;border-radius:999px;font-weight:bold;font-size:14px;">
        Độ phù hợp (AI): ${escapeHtml(score)}%
      </span>
    </p>
    <div style="margin-top:16px;">
      <a href="${escapeAttr(ctaUrl)}" style="background:#2563eb;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:500;">Xem hồ sơ ứng viên</a>
    </div>
  </div>`;

/** Email tổng hợp gửi doanh nghiệp: các hồ sơ có điểm khớp cao trong ngày. */
const renderEmployerDigest = ({ tpl, employer, applicants, threshold, frontendUrl }) => {
  const t = tpl.employerDigest;
  const vars = {
    brand: tpl.brand.name,
    name: employer.companyName || employer.email,
    count: applicants.length,
    threshold,
  };

  const listHtml = applicants
    .map((a) =>
      candidateCard({
        fullName: a.fullName,
        headline: a.headline,
        jobTitle: a.jobTitle,
        score: a.score,
        skills: a.skills,
        appliedAt: a.appliedAt,
        ctaUrl: `${frontendUrl}/employer/candidates`,
      }),
    )
    .join('');

  const footerLink = `<a href="${frontendUrl}/employer/candidates" style="color:#2563eb;">${escapeHtml(
    fillPlain(t.footerLinkLabel, vars),
  )}</a>`;

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;">${fill(t.greeting, vars)}</h2>
        <p>${fill(t.intro, vars)}</p>
        <p>${fill(t.listLead, vars)}</p>
        <div style="margin-top:24px;">${listHtml}</div>`,
      footerHtml: `${fill(t.footer, vars)}<br/>${footerLink}`,
    }),
  };
};

/** Email báo tài khoản sinh viên đã được tạo sẵn, kèm mật khẩu tạm thời. */
const renderAccountCreated = ({ tpl, user, password, frontendUrl, mode }) => {
  const t = tpl.accountCreated;
  const schoolEmail = schoolEmailOf(user.studentId) || '';
  const vars = {
    brand: tpl.brand.name,
    name: user.fullName || user.email,
    email: user.email,
    major: user.major || 'của bạn',
    phone: user.phone || '',
    studentId: user.studentId || '',
    schoolEmail,
  };

  // Thư gửi bù chỉ tới email trường: sinh viên có thể đã cầm mật khẩu ở thư
  // gmail trước, nên phải nói rõ mật khẩu đó hết hiệu lực — không thì họ thử mật
  // khẩu cũ, sai, rồi tưởng tài khoản hỏng.
  const schoolNoteHtml =
    mode === 'school' && t.schoolNote && schoolEmail
      ? highlight(`<em>${fill(t.schoolNote, vars)}</em>`)
      : '';

  const rows = [
    ['Email đăng nhập', user.email],
    user.studentId ? ['Mã số sinh viên', user.studentId] : null,
    user.major ? ['Ngành học', user.major] : null,
    user.phone ? ['Điện thoại', user.phone] : null,
  ].filter(Boolean);

  const infoTable = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${rows
        .map(
          ([k, v]) => `
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:14px;width:40%;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(v)}</td>
        </tr>`,
        )
        .join('')}
    </table>`;

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;font-size:18px;">${fill(t.heading, vars)}</h2>
        <p style="color:#334155;font-size:14px;line-height:1.6;">${fill(t.intro, vars)}</p>
        ${schoolNoteHtml}
        ${infoTable}
        <div style="text-align:center;margin:20px 0;">
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;">${fill(t.passwordLabel, vars)}</p>
          <div style="display:inline-block;background:#f1f5f9;border:1px dashed ${BRAND_ACCENT};border-radius:10px;padding:14px 26px;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:bold;letter-spacing:3px;color:${BRAND_ACCENT};">${escapeHtml(
              password,
            )}</span>
          </div>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${frontendUrl}/login" style="background:${BRAND_ACCENT};color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">
            ${fill(t.buttonLabel, vars)}
          </a>
        </div>
        ${t.note ? highlight(`<em>${fill(t.note, vars)}</em>`) : ''}
        ${t.nextSteps ? `<p style="color:#334155;font-size:14px;line-height:1.6;">${fill(t.nextSteps, vars)}</p>` : ''}`,
      footerHtml: fill(t.footer, vars),
    }),
  };
};

/**
 * Thư mời doanh nghiệp do admin import.
 *
 * Khác thư sinh viên ở chỗ người đọc là một tổ chức chưa từng nghe tới hệ thống:
 * phải đủ trang trọng để không bị coi là thư rác, và phải trả lời ngay được câu
 * "vào đó thì được gì" — nên có danh sách quyền lợi và một nút bấm duy nhất,
 * thay vì chỉ ném ra mật khẩu như thư sinh viên.
 */
const renderCompanyAccountCreated = ({ tpl, user, company, password, frontendUrl }) => {
  const t = tpl.companyAccountCreated;
  const companyName = company?.companyName || user.fullName || user.email;
  const vars = {
    brand: tpl.brand.name,
    company: companyName,
    email: user.email,
    phone: company?.phone || user.phone || '',
    address: company?.address || '',
  };

  const rows = [
    ['Email đăng nhập', user.email],
    vars.phone ? ['Số điện thoại', vars.phone] : null,
    vars.address ? ['Địa chỉ', vars.address] : null,
  ].filter(Boolean);

  const infoTable = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${rows
        .map(
          ([k, v]) => `
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:14px;width:40%;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(v)}</td>
        </tr>`,
        )
        .join('')}
    </table>`;

  const benefitItems = String(t.benefits || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const benefitsHtml = benefitItems.length
    ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;margin:20px 0;">
        <p style="margin:0 0 10px;color:#0f172a;font-size:14px;font-weight:600;">${fill(
          t.benefitsLead,
          vars,
        )}</p>
        <table style="width:100%;border-collapse:collapse;">
          ${benefitItems
            .map(
              (item) => `
          <tr>
            <td style="padding:4px 8px 4px 0;vertical-align:top;color:${BRAND_ACCENT};font-size:14px;font-weight:bold;width:18px;">✓</td>
            <td style="padding:4px 0;color:#334155;font-size:14px;line-height:1.6;">${fill(item, vars)}</td>
          </tr>`,
            )
            .join('')}
        </table>
      </div>`
    : '';

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;font-size:18px;color:#0f172a;">${fill(t.heading, vars)}</h2>
        <p style="color:#334155;font-size:14px;line-height:1.7;">${fill(t.intro, vars)}</p>
        ${infoTable}
        <div style="text-align:center;margin:20px 0;">
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;">${fill(t.passwordLabel, vars)}</p>
          <div style="display:inline-block;background:#f1f5f9;border:1px dashed ${BRAND_ACCENT};border-radius:10px;padding:14px 26px;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:bold;letter-spacing:3px;color:${BRAND_ACCENT};">${escapeHtml(
              password,
            )}</span>
          </div>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${frontendUrl}/login?role=employer" style="background:${BRAND_ACCENT};color:#fff;padding:14px 34px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;">
            ${fill(t.buttonLabel, vars)}
          </a>
        </div>
        ${benefitsHtml}
        ${t.note ? highlight(`<em>${fill(t.note, vars)}</em>`) : ''}
        ${t.nextSteps ? `<p style="color:#334155;font-size:14px;line-height:1.7;">${fill(t.nextSteps, vars)}</p>` : ''}
        ${t.support ? `<p style="color:#64748b;font-size:13px;line-height:1.6;">${fill(t.support, vars)}</p>` : ''}`,
      footerHtml: fill(t.footer, vars),
    }),
  };
};

/** Email nhắc gia hạn tin tuyển dụng sắp hết hiển thị. */
const renderJobExpiring = ({ tpl, employer, jobs, days, frontendUrl }) => {
  const t = tpl.jobExpiring;
  const vars = {
    brand: tpl.brand.name,
    name: employer.companyName || employer.email,
    count: jobs.length,
    days,
  };

  const listHtml = jobs
    .map(
      (j) => `
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#fffbeb;">
    <h3 style="margin:0 0 6px;color:#92400e;font-size:17px;">${escapeHtml(j.title)}</h3>
    <p style="margin:4px 0;color:#475569;font-size:14px;"><strong>Hết hạn:</strong> ${escapeHtml(j.expiresAt)}</p>
    <p style="margin:4px 0;color:#475569;font-size:14px;"><strong>Còn lại:</strong> ${escapeHtml(
      j.daysLeft,
    )} ngày</p>
    ${
      typeof j.applicationCount === 'number'
        ? `<p style="margin:4px 0;color:#475569;font-size:14px;"><strong>Hồ sơ đã nhận:</strong> ${escapeHtml(
            j.applicationCount,
          )}</p>`
        : ''
    }
    <div style="margin-top:16px;">
      <a href="${escapeAttr(`${frontendUrl}/employer/jobs/${seg(j.id)}`)}" style="background:#d97706;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:500;">Gia hạn tin này</a>
    </div>
  </div>`,
    )
    .join('');

  const footerLink = `<a href="${frontendUrl}/employer/email-settings" style="color:#2563eb;">${escapeHtml(
    fillPlain(t.footerLinkLabel, vars),
  )}</a>`;

  return {
    subject: fillPlain(t.subject, vars),
    html: layout({
      brand: tpl.brand,
      bodyHtml: `
        <h2 style="margin-top:0;">${fill(t.greeting, vars)}</h2>
        <p>${fill(t.intro, vars)}</p>
        <p>${fill(t.listLead, vars)}</p>
        <div style="margin-top:24px;">${listHtml}</div>`,
      footerHtml: `${fill(t.footer, vars)}<br/>${footerLink}`,
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
  code: '482913',
  student: {
    email: 'sinhvien@example.com',
    fullName: 'Nguyễn Văn A',
    studentId: '102210123',
    major: 'Công nghệ Thông tin',
    phone: '0901234567',
  },
  tempPassword: 'Kx7m-Qp2n',
  companyAccount: {
    user: { email: 'tuyendung@congtymau.vn', fullName: 'Công ty TNHH Mẫu' },
    company: {
      companyName: 'Công ty TNHH Mẫu',
      phone: '0236 123 4567',
      address: '54 Nguyễn Lương Bằng, Liên Chiểu, Đà Nẵng',
    },
  },
  expiringJobs: [
    { id: 'job1', title: 'Lập trình viên Backend (Node.js)', expiresAt: '03/09/2026', daysLeft: 3, applicationCount: 12 },
    { id: 'job2', title: 'Kỹ sư Dữ liệu', expiresAt: '05/09/2026', daysLeft: 5, applicationCount: 4 },
  ],
  employer: { companyName: 'Công ty TNHH Mẫu', email: 'tuyendung@example.com' },
  applicants: [
    {
      fullName: 'Trần Thị B',
      headline: 'Lập trình viên Backend · 3 năm kinh nghiệm',
      jobTitle: 'Lập trình viên Backend (Node.js)',
      score: 91,
      skills: ['Node.js', 'MongoDB', 'Docker'],
      appliedAt: '31/08/2026 09:15',
    },
    {
      fullName: 'Lê Văn C',
      headline: 'Kỹ sư dữ liệu',
      jobTitle: 'Kỹ sư Dữ liệu',
      score: 76,
      skills: ['Python', 'SQL'],
      appliedAt: '31/08/2026 11:40',
    },
  ],
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
      code: SAMPLE.code,
      minutes: 10,
    });
  }
  if (key === 'verifyEmail') {
    return renderVerifyEmail({
      tpl,
      fullName: SAMPLE.user.fullName,
      to: SAMPLE.user.email,
      code: SAMPLE.code,
      minutes: 10,
    });
  }
  if (key === 'employerDigest') {
    return renderEmployerDigest({
      tpl,
      employer: SAMPLE.employer,
      applicants: SAMPLE.applicants,
      threshold: 70,
      frontendUrl,
    });
  }
  if (key === 'jobExpiring') {
    return renderJobExpiring({
      tpl,
      employer: SAMPLE.employer,
      jobs: SAMPLE.expiringJobs,
      days: 7,
      frontendUrl,
    });
  }
  if (key === 'accountCreated') {
    return renderAccountCreated({
      tpl,
      user: SAMPLE.student,
      password: SAMPLE.tempPassword,
      frontendUrl,
    });
  }
  if (key === 'companyAccountCreated') {
    return renderCompanyAccountCreated({
      tpl,
      user: SAMPLE.companyAccount.user,
      company: SAMPLE.companyAccount.company,
      password: SAMPLE.tempPassword,
      frontendUrl,
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
  renderVerifyEmail,
  renderEmployerDigest,
  renderJobExpiring,
  renderAccountCreated,
  renderCompanyAccountCreated,
  renderPreview,
  escapeHtml,
};
