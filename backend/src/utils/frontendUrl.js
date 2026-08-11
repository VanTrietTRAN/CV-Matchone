/**
 * Origin của frontend, dùng để dựng link trong email và redirect sau OAuth.
 *
 * Lưu ý quan trọng: KHÔNG dùng trực tiếp CLIENT_ORIGIN cho mục đích này.
 * CLIENT_ORIGIN là allowlist CORS và có thể chứa nhiều origin cách nhau bởi dấu phẩy
 * (vd: "https://a.com,https://www.a.com") — ghép nguyên chuỗi đó vào URL sẽ tạo ra
 * đường dẫn hỏng như "https://a.com,https://www.a.com/login?oauth=success".
 *
 * Thứ tự ưu tiên:
 *   1. FRONTEND_URL
 *   2. Origin ĐẦU TIÊN trong CLIENT_ORIGIN (để môi trường cũ chỉ đặt CLIENT_ORIGIN vẫn chạy)
 *   3. http://localhost:3000
 *
 * Dấu "/" ở cuối luôn được cắt bỏ để `${frontendOrigin()}/login` không thành "//login".
 */
const frontendOrigin = () => {
  const explicit = (process.env.FRONTEND_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const firstAllowed = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)[0];
  if (firstAllowed) return firstAllowed.replace(/\/+$/, '');

  return 'http://localhost:3000';
};

module.exports = { frontendOrigin };
