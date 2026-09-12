const crypto = require('crypto');

/**
 * Mật khẩu tạm ngẫu nhiên cho tài khoản do admin tạo hộ.
 *
 * Tách ra khỏi importController vì worker gửi email cũng cần dùng: mật khẩu được
 * sinh ngay lúc gửi thư chứ không lưu sẵn trong database.
 *
 * Bỏ các ký tự dễ nhìn nhầm (0/O, 1/l/I) vì sinh viên phải chép tay từ email.
 */
const LENGTH = 9;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generatePassword = () => {
  let out = '';
  for (let i = 0; i < LENGTH; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    // Gạch nối ở giữa cho dễ đọc, không tính vào độ dài
    if (i === 3) out += '-';
  }
  return out;
};

module.exports = { generatePassword, LENGTH };
