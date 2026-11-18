/**
 * Chuẩn hoá NFKC chữ người dùng nhập.
 *
 * Doanh nghiệp hay dán tiêu đề "chữ đẹp" chép từ mạng xã hội, thật ra là kí tự
 * toán học Unicode: "𝑵𝒉𝒂̂𝒏 𝒗𝒊𝒆̂𝒏" thay cho "Nhân viên". Hậu quả:
 *   - bộ lọc thư rác coi đó là dấu hiệu né bộ lọc, thư gợi ý việc làm vào Spam;
 *   - ô tìm kiếm gõ "nhân viên" không ra tin đó;
 *   - mô hình embedding đọc ra chuỗi vô nghĩa, điểm phù hợp với CV sai lệch.
 * NFKC đổi về đúng chữ thường; dấu tiếng Việt (kể cả dạng tổ hợp) được ghép lại
 * thành chữ dựng sẵn, nên "ậ" vẫn ra "ậ".
 *
 * Giá trị không phải chuỗi trả nguyên — dùng được làm setter của Mongoose mà
 * không biến `undefined` thành chuỗi rỗng.
 */
const normalizeText = (value) => (typeof value === 'string' ? value.normalize('NFKC') : value);

module.exports = { normalizeText };
