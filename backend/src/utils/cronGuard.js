const cron = require('node-cron');

/**
 * Kiểm tra biểu thức cron admin nhập trước khi lưu.
 *
 * Bản cũ chỉ đếm số trường và chặn đúng hai dạng "* *" và "*\/n *", nên "0-59 * * * *"
 * (mỗi phút) lọt qua, còn "abc def ghi jkl mno" thì được lưu rồi làm hỏng lịch.
 * Nay: node-cron phải chấp nhận biểu thức, và khoảng cách nhỏ nhất giữa hai lần
 * chạy trong ngày không dưới `minGapMinutes`.
 */

/** Mở rộng một trường cron (phút 0–59 hoặc giờ 0–23) thành danh sách giá trị. */
const expandField = (field, min, max) => {
  const out = new Set();
  for (const part of String(field).split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;

    let lo;
    let hi;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (/^\d+-\d+$/.test(rangePart)) {
      [lo, hi] = rangePart.split('-').map(Number);
    } else if (/^\d+$/.test(rangePart)) {
      lo = Number(rangePart);
      hi = stepPart === undefined ? lo : max;
    } else {
      return null;
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
};

/** Khoảng cách nhỏ nhất (phút) giữa hai lần chạy trong một ngày, kể cả vòng qua nửa đêm. */
const minGapMinutes = (expr) => {
  const parts = String(expr).trim().split(/\s+/);
  // node-cron cho phép trường giây ở đầu (6 trường) — có giây thì bỏ đi
  const [minuteField, hourField] = parts.length === 6 ? parts.slice(1) : parts;
  const minutes = expandField(minuteField, 0, 59);
  const hours = expandField(hourField, 0, 23);
  if (!minutes || !hours) return null;
  const times = [];
  for (const h of hours) for (const m of minutes) times.push(h * 60 + m);
  if (times.length <= 1) return 24 * 60;
  let gap = 24 * 60 - times[times.length - 1] + times[0];
  for (let i = 1; i < times.length; i += 1) gap = Math.min(gap, times[i] - times[i - 1]);
  return gap;
};

/**
 * @returns {{ok: true} | {ok: false, message: string}}
 */
const checkCronExpression = (expr, { minGap = 15 } = {}) => {
  if (typeof expr !== 'string' || !expr.trim()) {
    return { ok: false, message: 'Thiếu biểu thức cron.' };
  }
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { ok: false, message: 'Biểu thức cron cần đúng 5 trường: phút giờ ngày tháng thứ.' };
  }
  if (!cron.validate(expr.trim())) {
    return { ok: false, message: 'Biểu thức cron không hợp lệ.' };
  }
  const gap = minGapMinutes(expr);
  if (gap === null) {
    return { ok: false, message: 'Không đọc được trường phút/giờ của biểu thức cron.' };
  }
  if (gap < minGap) {
    return {
      ok: false,
      message: `Tần suất quá cao (${gap} phút/lần). Khoảng cách tối thiểu là ${minGap} phút.`,
    };
  }
  return { ok: true };
};

module.exports = { checkCronExpression, minGapMinutes };
