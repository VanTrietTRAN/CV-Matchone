const crypto = require('crypto');

/**
 * CAPTCHA kiểm tra PHÍA SERVER cho form đăng ký doanh nghiệp.
 *
 * Trước đây mã xác nhận sinh bằng Math.random() trên trình duyệt và chỉ so ở
 * client — gọi thẳng POST /api/auth/register là bỏ qua hoàn toàn.
 *
 * Nay server sinh mã, vẽ thành ảnh SVG (mỗi ký tự là một đường path nhiễu,
 * không có chữ thật trong mã nguồn ảnh) và trả kèm một token ký HMAC. Server
 * không lưu gì; token hết hạn sau 5 phút và chỉ dùng được một lần.
 *
 * Đây là lớp chặn bot đơn giản, không thay được Turnstile/hCaptcha — nhưng đủ
 * để không còn đăng ký được bằng một lệnh curl.
 */

const TTL_MS = 5 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ I, O, 0, 1 dễ nhầm
const LENGTH = 5;

const secret = () => String(process.env.CAPTCHA_SECRET || process.env.JWT_SECRET || 'dev-captcha-secret');

const sign = (answer, exp, nonce) =>
  crypto.createHmac('sha256', secret()).update(`${answer.toUpperCase()}|${exp}|${nonce}`).digest('base64url');

// Nét vẽ 5×7 cho từng ký tự (1 = ô tô). Vẽ thành path để ảnh không chứa chữ.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const rnd = (min, max) => min + crypto.randomInt(0, 10_000) / 10_000 * (max - min);

const renderSvg = (text) => {
  const W = 150;
  const H = 50;
  const cell = 4;
  const parts = [];
  text.split('').forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    const ox = 12 + i * 27 + rnd(-2, 2);
    const oy = 10 + rnd(-3, 3);
    const rot = rnd(-18, 18).toFixed(1);
    let d = '';
    glyph.forEach((row, y) =>
      row.split('').forEach((bit, x) => {
        if (bit === '1') {
          const px = (x * cell + rnd(-0.6, 0.6)).toFixed(1);
          const py = (y * cell + rnd(-0.6, 0.6)).toFixed(1);
          d += `M${px} ${py}h${cell}v${cell}h-${cell}z`;
        }
      }),
    );
    parts.push(
      `<path transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) rotate(${rot} 10 14)" d="${d}" fill="#0f766e"/>`,
    );
  });
  for (let i = 0; i < 6; i += 1) {
    parts.push(
      `<line x1="${rnd(0, W).toFixed(0)}" y1="${rnd(0, H).toFixed(0)}" x2="${rnd(0, W).toFixed(0)}" y2="${rnd(0, H).toFixed(0)}" stroke="#94a3b8" stroke-width="1.2"/>`,
    );
  }
  // Xáo thứ tự phần tử để không đọc được ký tự theo thứ tự trong mã nguồn
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f1f5f9"/>${parts.join('')}</svg>`;
};

/** @returns {{token: string, image: string}} image là data URL SVG */
const issue = () => {
  let answer = '';
  for (let i = 0; i < LENGTH; i += 1) answer += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  const exp = Date.now() + TTL_MS;
  const nonce = crypto.randomBytes(9).toString('base64url');
  const token = `${exp}.${nonce}.${sign(answer, exp, nonce)}`;
  const image = `data:image/svg+xml;base64,${Buffer.from(renderSvg(answer)).toString('base64')}`;
  return { token, image };
};

// Token đã dùng — chặn dùng lại trong thời gian còn hạn (một tiến trình là đủ:
// token sống 5 phút, server khởi động lại thì token cũ cũng gần hết hạn)
const used = new Map();
const sweep = () => {
  const now = Date.now();
  for (const [k, exp] of used) if (exp < now) used.delete(k);
};

/** @returns {boolean} */
const verify = (token, answer) => {
  if (typeof token !== 'string' || typeof answer !== 'string') return false;
  const [expStr, nonce, mac] = token.split('.');
  const exp = Number(expStr);
  if (!exp || !nonce || !mac || exp < Date.now()) return false;
  if (used.has(nonce)) return false;
  const expected = Buffer.from(sign(answer.trim(), exp, nonce));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  sweep();
  used.set(nonce, exp);
  return true;
};

module.exports = { issue, verify };
