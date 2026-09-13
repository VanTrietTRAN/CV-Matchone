/**
 * Email trường của sinh viên DUT: <MSSV>@sv1.dut.udn.vn.
 *
 * Nhiều sinh viên không để ý thư gửi tới gmail cá nhân (rơi vào Quảng cáo, gõ sai
 * địa chỉ trong file của khoa...), nhưng hộp thư trường thì nhà trường vẫn dùng
 * để thông báo. Gửi thêm một bản tới đó để thư chắc chắn tới tay.
 *
 * Địa chỉ không lưu riêng mà dựng từ MSSV mỗi lần cần, để chỉ có một nguồn sự thật.
 * Đổi tên miền (trường khác, cơ sở khác) thì đặt biến SCHOOL_EMAIL_DOMAIN.
 */

const SCHOOL_EMAIL_DOMAIN = String(process.env.SCHOOL_EMAIL_DOMAIN || 'sv1.dut.udn.vn')
  .trim()
  .toLowerCase();

/**
 * Ô MSSV trong Excel -> chuỗi sạch. Ô kiểu số 102210123 đọc ra "102210123".
 * Viết hoa vì hộp thư không phân biệt hoa thường: "abc1" và "ABC1" là cùng một
 * địa chỉ, nên phải coi là cùng một MSSV khi kiểm tra trùng.
 */
const normalizeStudentId = (value) => String(value ?? '').replace(/\s+/g, '').toUpperCase();

// Chỉ nhận chữ và số. MSSV ghép thẳng vào phần trước @, nên một dấu chấm hay dấu
// cộng lọt vào là thành địa chỉ khác — có khi là hộp thư của người khác.
const isValidStudentId = (id) => /^[A-Za-z0-9]{4,20}$/.test(String(id || ''));

/** MSSV -> email trường, hoặc null nếu MSSV trống / không hợp lệ. */
const schoolEmailOf = (studentId) => {
  const id = normalizeStudentId(studentId);
  return id && isValidStudentId(id) ? `${id}@${SCHOOL_EMAIL_DOMAIN}`.toLowerCase() : null;
};

module.exports = { SCHOOL_EMAIL_DOMAIN, normalizeStudentId, isValidStudentId, schoolEmailOf };
