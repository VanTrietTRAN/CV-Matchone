const crypto = require('crypto');

/**
 * Mã xác thực 6 số dùng cho đăng ký lần đầu và đặt lại mật khẩu.
 *
 * Mã KHÔNG lưu thẳng vào database — chỉ lưu bản băm SHA-256, giống cách xử lý
 * token đặt lại mật khẩu trước đây. Ai đọc được database cũng không dùng lại
 * được mã đang có hiệu lực.
 *
 * Mã 6 số chỉ có một triệu khả năng nên bắt buộc phải chặn dò: mỗi mã sống 10
 * phút và chỉ cho nhập sai 5 lần, quá thì huỷ mã và phải xin mã mới.
 */

const CODE_LENGTH = 6;
const TTL_MS = 10 * 60 * 1000; // 10 phút
const MAX_ATTEMPTS = 5;

/** Sinh mã 6 số ngẫu nhiên an toàn (không dùng Math.random). */
const generateCode = () => {
  const max = 10 ** CODE_LENGTH;
  // randomInt trải đều, không bị lệch như phép chia dư trên randomBytes
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, '0');
};

const hashCode = (code) =>
  crypto.createHash('sha256').update(String(code).trim()).digest('hex');

/**
 * Tạo bộ giá trị để ghi vào document người dùng.
 * @returns {{code: string, hash: string, expiresAt: Date}} `code` là bản rõ, chỉ
 *          dùng để gửi email rồi bỏ đi — đừng ghi vào database hay log.
 */
const issueCode = () => {
  const code = generateCode();
  return { code, hash: hashCode(code), expiresAt: new Date(Date.now() + TTL_MS) };
};

/**
 * Đối chiếu mã người dùng nhập với bản băm đã lưu.
 * @returns {{ok: boolean, reason?: 'missing'|'expired'|'locked'|'wrong'}}
 */
const verifyCode = ({ input, hash, expiresAt, attempts = 0 }) => {
  if (!hash || !expiresAt) return { ok: false, reason: 'missing' };
  if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (new Date(expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  const given = hashCode(input);
  // So sánh theo thời gian hằng định để không lộ thông tin qua thời gian phản hồi
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'wrong' };
  }
  return { ok: true };
};

/** Câu thông báo cho từng lý do thất bại. */
const reasonMessage = (reason) =>
  ({
    missing: 'Chưa có mã xác thực nào đang chờ. Vui lòng bấm gửi lại mã.',
    expired: 'Mã xác thực đã hết hạn. Vui lòng bấm gửi lại mã.',
    locked: 'Bạn đã nhập sai quá nhiều lần. Vui lòng bấm gửi lại mã.',
    wrong: 'Mã xác thực không đúng.',
  })[reason] || 'Mã xác thực không hợp lệ.';

module.exports = { generateCode, hashCode, issueCode, verifyCode, reasonMessage, TTL_MS, MAX_ATTEMPTS, CODE_LENGTH };
