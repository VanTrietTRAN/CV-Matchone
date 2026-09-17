/**
 * Đọc và hiển thị số tiền theo quy ước Việt Nam.
 *
 * Dấu chấm ngăn hàng nghìn, dấu phẩy là dấu thập phân: "178.000" là một trăm
 * bảy mươi tám nghìn, "15,5 triệu" là mười lăm triệu rưỡi. `Number("178.000")`
 * của JavaScript đọc theo kiểu Mỹ và trả về 178, nên mọi chỗ nhận số tiền do
 * người dùng gõ hoặc từ file Excel phải đi qua đây thay vì gọi Number().
 *
 * Bản sao phía giao diện: frontend/lib/format.ts (formatSalary, parseMoney).
 * Đổi quy tắc ở một bên thì đổi cả bên kia.
 */

const CURRENCIES = ['VND', 'USD', 'EUR', 'JPY'];

const UNIT_FACTOR = {
  ty: 1e9,
  ti: 1e9,
  trieu: 1e6,
  tr: 1e6,
  m: 1e6,
  nghin: 1e3,
  ngan: 1e3,
  k: 1e3,
};

// Số (có thể kèm dấu ngăn) và đơn vị viết ngay sau, vd "15.000.000", "15,5 triệu",
// "500k", kể cả lối viết tắt "1tr5" (1,5 triệu). Thứ tự "trieu" trước "tr" để
// không cắt cụt; (?![a-z\d]) chặn "m" trong "mot"...
const AMOUNT_RE = /(\d+(?:[.,]\d+)*)\s*(?:(ty|ti|trieu|tr|nghin|ngan|k|m)(\d{1,3})?)?(?![a-z\d])/g;

/** Thường hoá, bỏ dấu tiếng Việt để so khớp đơn vị: "Triệu" -> "trieu". */
const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

/**
 * "15.000.000" -> 15000000, "15,5" -> 15.5, "178.000" -> 178000.
 *
 * Nhóm ba chữ số sau dấu chấm luôn là hàng nghìn. Sau dấu phẩy thì là hàng
 * nghìn khi không có đơn vị ("15,000,000" gõ kiểu Mỹ — tiền đồng không có ba
 * chữ số lẻ), còn có đơn vị thì là thập phân ("1,500 triệu" = 1,5 triệu).
 * Nhóm lẻ không đủ ba chữ số là phần thập phân ("15.5 triệu" gõ kiểu Mỹ).
 */
const readNumber = (token, hasUnit) => {
  const hasDot = token.includes('.');
  const hasComma = token.includes(',');

  if (hasDot && hasComma) {
    // Có cả hai: dấu đứng sau cùng là dấu thập phân ("1.250,5" hay "1,250.5")
    const decimal = token.lastIndexOf(',') > token.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    const n = Number(token.split(thousands).join('').replace(decimal, '.'));
    return Number.isFinite(n) ? n : null;
  }

  if (!hasDot && !hasComma) return Number(token);

  const sep = hasDot ? '.' : ',';
  const groups = token.split(sep);
  const tail = groups.slice(1);
  const allThousands = tail.every((g) => g.length === 3);

  if (groups.length > 2) {
    return allThousands ? Number(groups.join('')) : null;
  }
  if (allThousands && !(sep === ',' && hasUnit)) {
    return Number(groups.join(''));
  }
  return Number(`${groups[0]}.${groups[1]}`);
};

const toAmount = (token, unit, frac) => {
  // "1tr5" -> 1.5 triệu; chỉ áp dụng khi phần trước đơn vị là số trơn
  const n =
    frac && /^\d+$/.test(token) ? Number(`${token}.${frac}`) : readNumber(token, Boolean(unit));
  if (n == null || !Number.isFinite(n)) return null;
  // Không có đơn vị thì giữ nguyên phần lẻ: 189.4 từ ô Excel định dạng Mỹ là
  // "189.400" bị mất số 0 — restoreThousands cần phần lẻ đó để dựng lại.
  return unit ? Math.round(n * UNIT_FACTOR[unit]) : n;
};

/**
 * Một số tiền: số (giữ nguyên) hoặc chuỗi như "15.000.000", "15,5 triệu", "500k".
 * @returns {number|null}
 */
const parseMoney = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const match = normalize(value).matchAll(AMOUNT_RE).next().value;
  if (!match) return null;
  return toAmount(match[1], match[2], match[3]);
};

// Đồng và yên có mệnh giá nhỏ: mức lương dưới 1.000 là không thể có.
const THOUSANDS_CURRENCIES = ['VND', 'JPY'];

/**
 * 176 -> 176000 với VND / JPY. Số như vậy gần như chắc chắn là "176.000" đã bị
 * đọc kiểu Mỹ — kể cả khi ô Excel là ô số: Excel để định dạng Mỹ lưu "176.000"
 * thành con số 176 ngay lúc gõ, nên đọc chuỗi đúng cách thôi là chưa đủ.
 * Chỉ dùng cho dữ liệu không có người xem lại tận mắt (import, đồng bộ dữ liệu cũ);
 * ô nhập trên web đã hiện xem trước nên không tự sửa.
 */
const restoreThousands = (amount, currency = 'VND') => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return amount;
  if (THOUSANDS_CURRENCIES.includes(currency) && amount > 0 && amount < 1000) {
    return Math.round(amount * 1000);
  }
  return Math.round(amount);
};

const detectCurrency = (text) => {
  const s = normalize(text);
  if (/usd|us\$|\$|do la|dollar/.test(s)) return 'USD';
  if (/eur|€/.test(s)) return 'EUR';
  if (/jpy|\byen\b|¥/.test(s)) return 'JPY';
  return 'VND';
};

// Tên tiền người dùng hay gõ trong file Excel (đã bỏ dấu, thường hoá)
const CURRENCY_ALIASES = {
  VND: ['vnd', 'vn', 'dong', 'd', '₫', 'viet nam dong', 'dong viet nam'],
  JPY: ['jpy', 'yen', 'yen nhat', '¥', 'jp¥'],
  USD: ['usd', 'us$', '$', 'do', 'do la', 'do la my', 'dollar'],
  EUR: ['eur', 'euro', '€'],
};

/** "vnd", "VNĐ", "đồng" -> "VND"; "Yên", "Yên Nhật" -> "JPY"; lạ -> null để model dùng mặc định. */
const normalizeCurrency = (value) => {
  const s = normalize(value).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const hit = Object.entries(CURRENCY_ALIASES).find(([, names]) => names.includes(s));
  return hit ? hit[0] : null;
};

/**
 * Chuỗi mức lương -> khoảng số.
 *   "15 - 25 triệu"            -> 15tr .. 25tr (đơn vị cuối dùng chung cho cả hai số)
 *   "Từ 10 triệu" / "Trên 10tr" -> min
 *   "Tới 30 triệu" / "Up to $2000" -> max
 *   "12 triệu"                 -> min = max
 *   "Thoả thuận"               -> không có số
 */
const parseSalaryRange = (text) => {
  const currency = detectCurrency(text);
  const s = normalize(text).trim();
  const none = { min: null, max: null, currency };
  if (!s || /thoa thuan|canh tranh|negotiable/.test(s)) return none;

  const found = [...s.matchAll(AMOUNT_RE)]
    .slice(0, 2)
    .map((m) => ({ token: m[1], unit: m[2], frac: m[3] }));
  if (!found.length) return none;

  // "15 - 25 triệu": số đầu không ghi đơn vị thì mượn đơn vị của số sau
  if (found.length === 2 && !found[0].unit) found[0].unit = found[1].unit;

  const amounts = found.map((f) => toAmount(f.token, f.unit, f.frac));
  if (amounts.some((a) => a == null)) return none;

  // Hai số luôn là một khoảng, kể cả "Từ 10 đến 15 triệu"
  if (amounts.length === 2) {
    return { min: Math.min(...amounts), max: Math.max(...amounts), currency };
  }
  if (/^(tu|tren|toi thieu|it nhat|from|>)/.test(s)) {
    return { min: amounts[0], max: null, currency };
  }
  if (/^(toi|den|len den|duoi|toi da|up ?to|<)/.test(s)) {
    return { min: null, max: amounts[0], currency };
  }
  return { min: amounts[0], max: amounts[0], currency };
};

const VI = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const VI_INT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const SCALES = [
  [1e9, 'tỷ'],
  [1e6, 'triệu'],
  [1e3, 'nghìn'],
];

/**
 * 15000000 -> { num: "15", unit: "triệu" }, 178000 -> { num: "178", unit: "nghìn" },
 * 15500000 -> { num: "15,5", unit: "triệu" }.
 * Số lẻ không gọn trong hai chữ số thập phân thì in đủ: 15333333 -> "15.333.333 đ".
 */
const splitVnd = (amount) => {
  const scale = SCALES.find(([factor]) => amount >= factor);
  if (scale) {
    const value = amount / scale[0];
    if (Math.abs(value * 100 - Math.round(value * 100)) < 1e-6) {
      return { num: VI.format(value), unit: scale[1] };
    }
  }
  return { num: VI_INT.format(amount), unit: 'đ' };
};

// Ngoại tệ ghi số đủ kèm tên tiền theo lối tin tuyển dụng tiếng Việt:
// "176.000 yên", "1.500 USD" — thay cho "176.000 ¥", "1.500 US$" của Intl.
const FOREIGN_UNIT = { JPY: 'yên', USD: 'USD', EUR: 'EUR' };

const splitAmount = (amount, currency) =>
  currency === 'VND'
    ? splitVnd(amount)
    : { num: VI_INT.format(amount), unit: FOREIGN_UNIT[currency] || currency };

const joinAmount = ({ num, unit }) => `${num} ${unit}`;

/**
 * Hiển thị lương theo lối Việt Nam: "15 - 25 triệu", "Từ 178 nghìn",
 * "176.000 yên", "Thoả thuận". Hai đầu cùng đơn vị thì chỉ ghi đơn vị một lần.
 */
const formatSalary = (min, max, currency = 'VND', fallback = 'Thoả thuận') => {
  const hasMin = typeof min === 'number' && min > 0;
  const hasMax = typeof max === 'number' && max > 0;
  if (!hasMin && !hasMax) return fallback;

  const cur = currency || 'VND';
  if (hasMin && hasMax) {
    if (min === max) return joinAmount(splitAmount(min, cur));
    const a = splitAmount(min, cur);
    const b = splitAmount(max, cur);
    return a.unit === b.unit ? `${a.num} - ${b.num} ${b.unit}` : `${joinAmount(a)} - ${joinAmount(b)}`;
  }
  return hasMin
    ? `Từ ${joinAmount(splitAmount(min, cur))}`
    : `Tới ${joinAmount(splitAmount(max, cur))}`;
};

module.exports = {
  CURRENCIES,
  parseMoney,
  parseSalaryRange,
  normalizeCurrency,
  restoreThousands,
  formatSalary,
};
