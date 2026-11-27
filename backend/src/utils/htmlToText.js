/**
 * Dựng phần văn bản thuần (text/plain) từ HTML của email.
 *
 * Thư chỉ có HTML mà không có phần text đi kèm bị bộ lọc thư rác trừ điểm
 * (SpamAssassin gọi là MIME_HTML_ONLY), và trình đọc thư dạng văn bản không hiển
 * thị được gì. Nodemailer không tự sinh phần này, nên dựng từ chính HTML để hai
 * phần luôn khớp nội dung — viết tay riêng thì sớm muộn sẽ lệch nhau.
 *
 * Mẫu thư do hệ thống tự sinh, cấu trúc đơn giản (bảng, đoạn, nút bấm), nên vài
 * biểu thức chính quy là đủ, không cần kéo thêm thư viện.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      // &#99999999; vượt quá U+10FFFF làm fromCodePoint ném RangeError
      return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });

const htmlToText = (html) => {
  if (!html) return '';
  let s = String(html);

  // Phần không hiển thị
  s = s.replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // Link: giữ chữ và kèm địa chỉ, để người đọc bản text vẫn bấm/copy được.
  // Nút có chữ trùng địa chỉ thì không lặp lại.
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    if (!label || decodeEntities(label) === decodeEntities(href) || /^mailto:/i.test(href)) {
      return label || href;
    }
    return `${label} (${href})`;
  });

  // Ngắt dòng theo khối
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|li|blockquote)>/gi, '\n');
  s = s.replace(/<\/t[dh]>/gi, ' ');

  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);

  return s
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

module.exports = { htmlToText };
