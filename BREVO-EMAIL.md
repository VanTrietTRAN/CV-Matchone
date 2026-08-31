# Cấu hình gửi mail tự động bằng Brevo

Hướng dẫn từng bước cho CVMatchOne. Không chứa thông tin bí mật — điền giá trị
thật vào biến môi trường trên Railway, đừng viết vào file này.

Kiểm chứng lần cuối: tháng 8/2026, đối chiếu với giao diện Brevo hiện tại.
Viết cho trường hợp **đã có sẵn tài khoản Brevo**.

---

## 0. Hệ thống gửi những email nào

| Email | Kích hoạt khi | Mã nguồn |
|---|---|---|
| Gợi ý việc làm theo AI | Cron theo lịch admin đặt (mặc định 7h và 17h) | `cronJob.js` |
| Thông báo việc làm theo từ khoá | Cùng lượt cron | `cronJob.js` |
| Đặt lại mật khẩu | Người dùng bấm "Quên mật khẩu" | `authController.js` |
| Admin hỗ trợ đặt lại mật khẩu | Admin bấm trong trang Tài khoản | `adminController.js` |
| Thông báo toàn hệ thống | Admin gửi broadcast có tick "Gửi email" | `broadcastWorker.js` |

Tất cả đi qua một đường duy nhất: `backend/src/services/emailService.js` →
SMTP relay của Brevo.

---

## 1. Lấy SMTP key

Bạn đã có tài khoản Brevo, nên bỏ qua phần đăng ký.

**1.1** Mở thẳng trang SMTP key: <https://app.brevo.com/settings/keys/smtp>

Đi bằng menu cũng được: bấm **biểu tượng bánh răng** ở góc trên bên phải (nằm giữa
dấu **?** và chuông thông báo) → **SMTP & API** → tab **SMTP**.

> Đừng tìm trong mục **Transactional** ở thanh bên trái. Mục đó là nơi xem thống
> kê và nhật ký thư đã gửi, không phải nơi lấy khoá.

**1.2** Trên tab **SMTP** có sẵn hai giá trị cần lấy:

| Ô trên Brevo | Biến môi trường | Dạng giá trị |
|---|---|---|
| **Login** | `EMAIL_USER` | `xxxxxx@smtp-brevo.com` |
| **SMTP key value** | `EMAIL_PASS` | bắt đầu bằng `xsmtpsib-` |

Nếu danh sách trống, bấm **Generate a new SMTP key**, đặt tên bất kỳ (ví dụ
`cvmatchone-railway`). Khoá chỉ hiện đầy đủ **một lần** — copy ngay, đóng hộp
thoại là không xem lại được nữa, phải tạo khoá khác.

> **Hai lỗi khiến phần lớn trường hợp thất bại, và Brevo trả về đúng một mã 535
> cho cả hai:**
>
> 1. **Dán nhầm API key.** Ngay cạnh tab SMTP là tab **API keys**, khoá ở đó bắt
>    đầu bằng `xkeysib-`. Khoá đó hợp lệ, nhưng hợp lệ cho REST API chứ không phải
>    SMTP. Cái bạn cần bắt đầu bằng `xsmtpsib-`.
> 2. **`EMAIL_USER` điền email đăng nhập Brevo.** SMTP login là một địa chỉ riêng
>    dạng `xxxxxx@smtp-brevo.com`, khác với email bạn dùng để đăng nhập.
>
> Hệ thống tự phát hiện cả hai và nói thẳng ra — xem mục 5.

**1.3** Kiểm tra tài khoản đã được phép gửi chưa: bấm **Usage and plan** ở góc
trên bên phải, hoặc xem khối **Your plan usage** ngay trang chủ. Dòng **Emails**
phải hiện dạng `300 left out of 300 until <ngày>`. Nếu chỗ đó báo tài khoản đang
chờ duyệt hoặc bị giới hạn, SMTP sẽ từ chối dù cấu hình đúng — xử lý xong mới đi
tiếp.

---

## 2. Xác thực tên miền gửi

**Bắt buộc, không bỏ qua được.** Từ tháng 2/2024 Gmail và Yahoo yêu cầu xác thực
tên miền, Microsoft theo sau từ tháng 5/2025. Gửi từ tên miền chưa xác thực thì
thư vào thẳng spam hoặc bị chặn.

**2.1** Mở **bánh răng** (Settings) → **Senders, Domains, IPs** → tab **Domains**
→ **Add a domain**.

**2.2** Nhập tên miền bạn sở hữu (ví dụ `cvmatchone.com`), rồi chọn
**Authenticate the domain yourself**. Brevo đưa ra ba bản ghi DNS cần thêm:
**Brevo code**, **DKIM**, **DMARC**.

**2.3** Thêm ba bản ghi đó vào DNS. Nếu tên miền đang ở Cloudflare:
Cloudflare Dashboard → chọn tên miền → **DNS** → **Add record**, dán từng bản ghi.

> Với các bản ghi TXT/CNAME dùng để xác thực email, để **Proxy status = DNS only**
> (đám mây xám). Bật proxy sẽ khiến Brevo không đọc được bản ghi.

**2.4** Quay lại Brevo, bấm **Authenticate this email domain** ở cuối trang. DNS
lan truyền thường mất vài phút, có thể tới vài giờ — Brevo cho thử lại trong vòng
48 giờ cho đến khi tên miền hiện trạng thái **Authenticated**.

**2.5** Đặt `SENDER_EMAIL` dùng đúng tên miền vừa xác thực:

```
SENDER_EMAIL=CVMatchOne <no-reply@cvmatchone.com>
```

> **Chưa có tên miền riêng?** Vẫn gửi được để thử nghiệm: **Settings** →
> **Senders, Domains, IPs** → tab **Senders** → **Add a sender**, dùng một địa chỉ
> Gmail của bạn rồi xác nhận qua thư Brevo gửi tới. Cách này chỉ hợp để chạy thử —
> gửi hàng loạt sẽ vào spam vì tên miền gửi không có DKIM.

---

## 3. Đặt biến môi trường trên Railway

Railway → service **backend** → tab **Variables** → thêm 5 biến:

```
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=<SMTP login dạng xxxxxx@smtp-brevo.com>
EMAIL_PASS=<SMTP key bắt đầu bằng xsmtpsib->
SENDER_EMAIL=CVMatchOne <no-reply@ten-mien-da-xac-thuc.com>
```

Rồi **Restart** service. Biến môi trường chỉ được đọc lúc khởi động.

**Về cổng:** dùng **587** (STARTTLS). Nếu nhà mạng hoặc hạ tầng chặn 587, Brevo
còn hỗ trợ **465** (SSL, code tự chuyển sang `secure: true`) và **2525**.

**Khi dán khoá, đừng để dính dấu cách hay xuống dòng ở đầu/cuối.** Code đã tự cắt
khoảng trắng và cảnh báo, nhưng ô nhập của Railway rất dễ nuốt thêm ký tự.

---

## 4. Đặt lịch gửi tự động

Lịch nằm trong database, không phải trong biến môi trường — sửa được ngay trên
giao diện, không cần deploy lại.

Đăng nhập admin → **Hệ thống** → khối **Cấu hình lịch gửi email**:

| Lựa chọn | Cron | Ý nghĩa |
|---|---|---|
| Mỗi phút (Demo) | `* * * * *` | Chỉ để trình diễn, đốt quota rất nhanh |
| Mỗi giờ | `0 * * * *` | |
| **Hàng ngày** | `0 7,17 * * *` | Mặc định — 7h sáng và 5h chiều |
| Hàng tuần | thứ 2 | |
| Tùy chỉnh | tự nhập | Hệ thống chặn nếu dày hơn 15 phút/lần |

Múi giờ đã cố định là **Asia/Ho_Chi_Minh** (`CRON_TIMEZONE`), nên "7h" nghĩa là 7h
giờ Việt Nam. Không khai báo múi giờ thì node-cron dùng giờ container — Railway
chạy UTC, lệch 7 tiếng.

**Lưu ý quota:** gói Free 300 email/ngày. Mỗi lượt cron gửi tối đa một email cho
mỗi ứng viên có CV và đang bật nhận thư. Trên 150 ứng viên hoạt động thì lịch
"hàng ngày, 2 lần" đã chạm trần.

---

## 5. Kiểm tra — theo đúng thứ tự này

### Bước 1 — Cấu hình có đọc được không (không gửi gì)

```bash
curl https://<backend-url>/health
```

Xem trường `email`:

```json
"email": {
  "configured": true,
  "host": "smtp-relay.brevo.com",
  "port": 587,
  "user": "abc***@smtp-brevo.com",
  "keyPrefix": "xsmtpsib-...",
  "sender": "CVMatchOne <no-reply@cvmatchone.com>",
  "problems": [],
  "warnings": []
}
```

`problems` không rỗng thì sửa hết trước khi đi tiếp — hệ thống nói rõ sai ở đâu.

### Bước 2 — Bắt tay thật với SMTP (không tốn quota)

```bash
curl "https://<backend-url>/health?email=1"
```

Có `"ok": true` là thông tin đăng nhập dùng được.

Hoặc bấm nút **Kiểm tra kết nối SMTP** trong admin → **Hệ thống**.

### Bước 3 — Gửi thử một email thật (tốn 1 quota)

Admin → **Hệ thống** → **Gửi Email Test**. Thư gửi về chính địa chỉ admin đang
đăng nhập. Nhớ xem cả hộp thư rác.

> Nút này trước đây luôn báo "thành công" kể cả khi gửi hỏng, vì hàm gửi nuốt mọi
> lỗi. Nay nó báo đúng kết quả kèm nguyên nhân.

### Bước 4 — Đối chiếu ở phía Brevo

Vào Brevo → **Transactional** (thanh bên trái) → **Logs** (hoặc **Statistics**).
Thư vừa gửi phải xuất hiện ở đây với trạng thái *Delivered*.

Đây là bước hay bị bỏ qua nhưng lại phân biệt được hai trường hợp rất khác nhau:

| Trong Brevo | Nghĩa là |
|---|---|
| Không thấy thư nào | Thư chưa rời khỏi hệ thống — lỗi ở cấu hình SMTP, quay lại bước 1 |
| Có thư, trạng thái *Delivered* | Brevo đã gửi thành công. Không thấy trong hộp thư thì kiểm tra spam và mục 2 |
| Có thư, trạng thái *Soft/Hard bounce* | Địa chỉ nhận có vấn đề, hoặc tên miền gửi chưa xác thực |
| Có thư, trạng thái *Blocked* | Địa chỉ nhận nằm trong danh sách chặn của Brevo |

### Bước 5 — Chạy thật

Admin → **Hệ thống** → **Quét & Gửi ngay**. Hệ thống quét toàn bộ ứng viên, chấm
điểm phù hợp và gửi thư cho những người vượt ngưỡng.

Theo dõi quota còn lại ở Brevo: **Usage and plan** góc trên bên phải, hoặc khối
**Your plan usage** ngay trang chủ.

---

## 6. Bảng tra lỗi

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| `problems` báo "vẫn là giá trị mẫu" | Chưa đặt biến trên Railway, đang dùng giá trị trong `.env.example` | Đặt biến thật rồi Restart |
| `problems` báo API key `xkeysib-` | Dán nhầm API key vào ô SMTP key | Lấy key ở tab **SMTP**, bắt đầu bằng `xsmtpsib-` |
| `warnings` báo `EMAIL_USER` sai dạng | Dùng email tài khoản làm SMTP login | Lấy SMTP login dạng `xxxxxx@smtp-brevo.com` |
| `warnings` báo khoảng trắng thừa | Copy dính dấu cách / xuống dòng | Code đã tự cắt, nhưng nên dán lại cho sạch |
| **535 Authentication failed** | Sai login hoặc key | Xem 3 nguyên nhân ở mục 1.4 |
| **550 / sender not authorized** | `SENDER_EMAIL` chưa thuộc tên miền đã xác thực | Làm mục 2 |
| ETIMEDOUT / ECONNREFUSED | Sai host hoặc cổng bị chặn | Kiểm tra `EMAIL_HOST`, thử cổng 465 hoặc 2525 |
| Gửi được nhưng vào spam | Thiếu DKIM/DMARC trên tên miền gửi | Làm mục 2 cho đủ cả 3 bản ghi |
| Đang gửi thì dừng giữa chừng | Hết 300 email/ngày | Chờ quota reset, hoặc giãn lịch cron, hoặc nâng gói |
| SMTP báo OK nhưng Brevo → Transactional → Logs trống | Thư không rời khỏi hệ thống | Xem lại `problems` ở bước 1 |
| Brevo báo *Blocked* | Địa chỉ nhận nằm trong danh sách chặn của Brevo | Brevo → Transactional → Blocked contacts, gỡ ra |
| Nhận mail lệch 7 tiếng | `CRON_TIMEZONE` bị ghi đè sai | Bỏ biến đó đi để dùng mặc định `Asia/Ho_Chi_Minh` |

---

## 7. Những gì đã sửa trong code

Trước đây cấu hình Brevo gần như không thể dò được:

- **`sendJobMatchEmail` và `sendJobAlertEmail` nuốt toàn bộ lỗi** — chỉ ghi
  `console.error` rồi trả về `undefined`. Nút "Gửi Email Test" của admin gọi hàm
  này rồi báo "thành công" vô điều kiện, kể cả khi SMTP từ chối. Nay hai hàm trả
  về `{ sent, error }` và nút test báo đúng sự thật.
- **Không có chỗ nào hiển thị cấu hình email** — `/health` không có, trang quản
  trị không có. Nay cả hai đều có, kèm danh sách `problems` và `warnings`.
- **Không phân biệt được các kiểu sai** — Brevo trả cùng một mã 535 cho mọi
  trường hợp. Nay code tự nhận diện API key dán nhầm, khoảng trắng thừa, SMTP
  login sai dạng, và tên miền gửi chưa xác thực.
- **Địa chỉ gửi mặc định là một Gmail cá nhân** hard-code trong ba hàm khác nhau.
  Nay dùng chung một nguồn.
- **`RESEND_API_KEY` được đọc làm mật khẩu SMTP dự phòng** — khoá Resend không bao
  giờ dùng được với SMTP của Brevo, chỉ khiến lỗi khó hiểu hơn. Đã bỏ.

---

## 8. Nguồn tham khảo

- [Brevo — SMTP relay integration](https://developers.brevo.com/docs/smtp-integration)
- [Brevo — Send transactional emails using Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
- [Brevo — Create and manage your SMTP keys](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys)
- [Brevo — Authenticate your domain (Brevo code, DKIM, DMARC)](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Brevo — Which SMTP port should I use?](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525)
- [Brevo — Troubleshooting SMTP issues](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP)
- [Brevo — Getting started with senders and domains](https://developers.brevo.com/docs/getting-started-with-senders-and-domains)
- [Brevo — Limits of the Free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo — Comply with Gmail, Yahoo and Microsoft sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
