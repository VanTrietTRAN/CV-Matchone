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

/** File là bảng tính nhị phân (xlsx = zip "PK", xls = OLE) hay văn bản (CSV)? */
const isBinarySheet = (buf) =>
  buf.length >= 4 &&
  ((buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0));

/**
 * Ô bắt đầu bằng = @ (hoặc + - không phải số) là công thức khi mở lại bằng Excel
 * — file xuất ra từ dữ liệu này có thể chạy lệnh trên máy người mở (CSV/Formula
 * injection). Thêm dấu nháy đơn để Excel coi là chữ. Số điện thoại "+84..." và số
 * âm vẫn giữ nguyên.
 */
const neutralizeFormula = (value) => {
  const v = String(value);
  if (/^[=@\t\r]/.test(v)) return `'${v}`;
  if (/^[+-]/.test(v) && !/^[+-]?[\d\s().]+$/.test(v)) return `'${v}`;
  return v;
};

/** Ngày trong ô Excel → 'YYYY-MM-DD' theo lịch người dùng thấy, không lệch múi giờ. */
const formatCellDate = (d) => {
  // SheetJS dựng Date lúc 00:00 giờ máy chủ; toISOString() đổi sang UTC nên ở
  // múi giờ +7 thành ngày hôm trước. Cộng nửa ngày rồi đọc theo giờ máy chủ.
  const x = new Date(d.getTime() + 12 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

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
  // CSV đọc dưới dạng chuỗi UTF-8: đọc như buffer thì SheetJS đoán bảng mã
  // Latin-1 với file không có BOM ("Họ và tên" thành "Há» vÃ  tÃªn"), và tự
  // đổi "0905123456" thành số 905123456. raw: true giữ nguyên chữ trong CSV.
  const wb = isBinarySheet(buffer)
    ? XLSX.read(buffer, { type: 'buffer', cellDates: true, sheetRows: MAX_ROWS + 50 })
    : XLSX.read(buffer.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', raw: true, sheetRows: MAX_ROWS + 50 });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('File không có sheet nào.');

  // Giữ cả dòng trống (rồi tự bỏ qua) để số dòng báo lỗi khớp đúng dòng trong file
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    blankrows: true,
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
        cell instanceof Date ? formatCellDate(cell) : neutralizeFormula(String(cell ?? '').trim());
    }
    rows.push(record);
  }

  const dataRows = raw.slice(1).filter((l) => l && !l.every((c) => String(c ?? '').trim() === '')).length;
  return { rows, headers: originalHeaders, missingColumns, mapping, truncated: dataRows > MAX_ROWS };
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
 * Cột cho import tài khoản doanh nghiệp.
 *
 * Email vừa là khoá chính vừa là tên đăng nhập, nên bắt buộc; tên doanh nghiệp
 * bắt buộc vì nó hiện trên mọi tin tuyển dụng và trong chính thư mời gửi đi.
 * Điện thoại và địa chỉ chỉ để điền sẵn hồ sơ công ty, thiếu vẫn tạo được.
 */
const COMPANY_COLUMNS = {
  companyName: {
    aliases: ['Tên doanh nghiệp', 'Tên công ty', 'Doanh nghiệp', 'Công ty', 'Company name'],
    required: true,
  },
  phone: { aliases: ['Số điện thoại', 'Điện thoại', 'SĐT', 'Phone'] },
  email: {
    aliases: ['Email', 'Email doanh nghiệp', 'Địa chỉ email', 'Email đăng nhập', 'Mail'],
    required: true,
  },
  address: { aliases: ['Địa chỉ', 'Dia chi', 'Trụ sở', 'Address'] },
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
  neutralizeFormula,
  buildTemplate,
  normalizeHeader,
  STUDENT_COLUMNS,
  COMPANY_COLUMNS,
  JOB_COLUMNS,
  MAX_ROWS,
};
