const XLSX = require('xlsx');

/**
 * Đọc file Excel/CSV thành mảng bản ghi, dùng chung cho import sinh viên và
 * import tin tuyển dụng.
 *
 * Người dùng thật không gõ tiêu đề cột giống hệt mẫu: họ viết hoa khác, thêm dấu
 * hai chấm, dùng "Mã số sinh viên" thay cho "MSSV", hoặc để lẫn khoảng trắng.
 * Nên thay vì so khớp chính xác, mỗi trường khai một danh sách tên có thể gặp và
 * đối chiếu sau khi chuẩn hoá (bỏ dấu, bỏ ký tự đặc biệt, thường hoá).
 */

const MAX_ROWS = 1000;

/** "Ngành học:" -> "nganh hoc" — bỏ dấu tiếng Việt và ký tự thừa để so khớp. */
const normalizeHeader = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Đọc buffer file thành mảng object theo cấu hình cột.
 *
 * @param {Buffer} buffer
 * @param {Record<string, {aliases: string[], required?: boolean}>} columns
 * @returns {{rows: object[], headers: string[], missingColumns: string[], mapping: object}}
 */
const parseSheet = (buffer, columns) => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('File không có sheet nào.');

  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: '',
  });
  if (!raw.length) throw new Error('File trống, không có dòng nào.');

  const headerRow = raw[0].map(normalizeHeader);
  const originalHeaders = raw[0].map((h) => String(h ?? '').trim());

  // Cột nào trong file khớp với trường nào
  const mapping = {};
  for (const [field, cfg] of Object.entries(columns)) {
    const wanted = cfg.aliases.map(normalizeHeader);
    const idx = headerRow.findIndex((h) => h && wanted.includes(h));
    if (idx !== -1) mapping[field] = idx;
  }

  const missingColumns = Object.entries(columns)
    .filter(([field, cfg]) => cfg.required && mapping[field] === undefined)
    .map(([, cfg]) => cfg.aliases[0]);

  const rows = [];
  for (let i = 1; i < raw.length && rows.length < MAX_ROWS; i += 1) {
    const line = raw[i];
    // Bỏ dòng trống hoàn toàn — file Excel hay có vài dòng thừa ở cuối
    if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;

    const record = { __row: i + 1 };
    for (const [field, idx] of Object.entries(mapping)) {
      const cell = line[idx];
      record[field] =
        cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '').trim();
    }
    rows.push(record);
  }

  return { rows, headers: originalHeaders, missingColumns, mapping, truncated: raw.length - 1 > MAX_ROWS };
};

/** Sinh file Excel mẫu để người dùng tải về điền theo. */
const buildTemplate = (columns, exampleRow) => {
  const headers = Object.values(columns).map((c) => c.aliases[0]);
  const example = Object.keys(columns).map((f) => exampleRow?.[f] ?? '');
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(16, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ─── Cấu hình cột cho từng loại import ───────────────────────────────────────

/**
 * Cột cho import tài khoản sinh viên.
 * Chỉ Họ và tên + Email là bắt buộc. MSSV chỉ bắt buộc khi admin bật gửi thêm tới
 * email trường — importController kiểm tra riêng trường hợp đó.
 */
const STUDENT_COLUMNS = {
  fullName: { aliases: ['Họ và tên', 'Họ tên', 'Ho ten', 'Full name', 'Tên'], required: true },
  studentId: { aliases: ['MSSV', 'Mã số sinh viên', 'Mã sinh viên', 'Mã SV', 'Student ID'] },
  major: { aliases: ['Ngành học', 'Ngành', 'Chuyên ngành', 'Major'] },
  email: { aliases: ['Email', 'Email sinh viên', 'Địa chỉ email', 'Mail'], required: true },
  phone: { aliases: ['Điện thoại', 'Số điện thoại', 'SĐT', 'Phone'] },
  note: { aliases: ['Ghi chú', 'Ghi chu', 'Note', 'Notes'] },
};

/**
 * Cột cho import tin tuyển dụng — đặt tên theo đúng nhãn ở trang "Đăng tin
 * tuyển dụng" để người dùng không phải học một bộ từ vựng thứ hai.
 */
const JOB_COLUMNS = {
  title: { aliases: ['Tiêu đề tin tuyển dụng', 'Tiêu đề', 'Vị trí tuyển dụng', 'Title'], required: true },
  description: { aliases: ['Mô tả chi tiết', 'Mô tả công việc', 'Mô tả', 'Description'], required: true },
  // Hai cột kỹ năng khớp đúng hai ô ở form đăng tin. Form gộp cả hai vào
  // Job.requirements — importController làm y hệt. Trước đây "Kỹ năng là lợi thế"
  // bị gán nhầm sang benefits: kỹ năng hiện ở mục Phúc lợi trên trang tin, và bị
  // loại khỏi văn bản tạo vector nên AI so khớp bỏ qua chúng.
  requiredSkills: { aliases: ['Kỹ năng bắt buộc', 'Yêu cầu', 'Yêu cầu ứng viên', 'Required skills', 'Requirements'] },
  niceToHaveSkills: { aliases: ['Kỹ năng là lợi thế', 'Kỹ năng ưu tiên', 'Nice to have'] },
  benefits: { aliases: ['Quyền lợi', 'Phúc lợi', 'Benefits'] },
  industry: { aliases: ['Ngành nghề', 'Lĩnh vực', 'Industry'] },
  specialization: { aliases: ['Vị trí chuyên môn', 'Chuyên môn', 'Specialization'] },
  jobType: { aliases: ['Hình thức làm việc', 'Loại hình', 'Job type'] },
  location: { aliases: ['Địa điểm làm việc', 'Địa điểm', 'Nơi làm việc', 'Location'] },
  salaryMin: { aliases: ['Lương tối thiểu', 'Lương từ', 'Salary min'] },
  salaryMax: { aliases: ['Lương tối đa', 'Lương đến', 'Salary max'] },
  currency: { aliases: ['Đơn vị tiền tệ', 'Tiền tệ', 'Currency'] },
  salary: { aliases: ['Mức lương', 'Lương', 'Salary'] },
  experience: { aliases: ['Kinh nghiệm yêu cầu', 'Kinh nghiệm', 'Experience'] },
  level: { aliases: ['Cấp bậc', 'Level'] },
  education: { aliases: ['Yêu cầu học vấn', 'Học vấn', 'Trình độ', 'Education'] },
  expiresAt: { aliases: ['Hạn nộp hồ sơ', 'Hạn nộp', 'Ngày hết hạn', 'Deadline'] },
};

module.exports = {
  parseSheet,
  buildTemplate,
  normalizeHeader,
  STUDENT_COLUMNS,
  JOB_COLUMNS,
  MAX_ROWS,
};
