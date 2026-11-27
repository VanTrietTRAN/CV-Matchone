/**
 * Kiểm tra URL và ảnh do người dùng gửi lên trước khi lưu.
 *
 * - website="javascript:alert(1)" từng được lưu nguyên văn rồi gắn thẳng vào
 *   <a href> ở trang việc làm công khai.
 * - Ảnh "data:image/svg+xml" từng được nhận cho ảnh CV, logo, ảnh bìa: SVG chứa
 *   được <script>, mở ảnh trong tab riêng là chạy mã.
 */

/** URL http/https hợp lệ, hoặc chuỗi rỗng. Trả về null nếu không an toàn. */
const safeHttpUrl = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return '';
  // Người dùng hay gõ "congty.vn" không có giao thức — tự thêm https://
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
};

// Chỉ ảnh raster. Giới hạn ~1.5MB dữ liệu base64 (trình duyệt đã thu nhỏ ảnh trước khi gửi)
const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const MAX_IMAGE_CHARS = 2_000_000;

/** Ảnh an toàn: rỗng, data URL jpeg/png/webp, hoặc URL https. */
const isSafeImage = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  if (value.length > MAX_IMAGE_CHARS) return false;
  if (value.startsWith('data:')) return IMAGE_DATA_URL.test(value);
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

module.exports = { safeHttpUrl, isSafeImage };
