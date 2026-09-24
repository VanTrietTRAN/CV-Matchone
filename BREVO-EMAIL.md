# Cấu hình gửi mail tự động bằng Brevo

Hướng dẫn từng bước cho CVMatchOne. Không chứa thông tin bí mật — điền giá trị
thật vào biến môi trường trên Railway, đừng viết vào file này.

Kiểm chứng lần cuối: tháng 8/2026, đối chiếu với **ảnh chụp giao diện Brevo thật**
(bảng Settings và wizard thêm tên miền). Viết cho trường hợp **đã có sẵn tài
khoản Brevo**.

> Đã đối chiếu bằng ảnh: bảng **Settings**, bước **Domain** và bước
> **Setup method** của wizard xác thực tên miền.
> Mục 2.5 đối chiếu với hộp thoại **Add record** thật của Cloudflare.
> Chưa đối chiếu được: nội dung bên trong trang **SMTP & API** (mục 1.2) và danh
> sách bản ghi cụ thể Brevo đưa ra. Nếu khác với mô tả, hãy sửa lại.

---

## 0. Hệ thống gửi những email nào

| Email | Gửi cho ai | Kích hoạt khi | Mã nguồn |
|---|---|---|---|
| Mã xác thực email | Người vừa đăng ký | Ngay lúc đăng ký, và khi bấm "Gửi lại mã" | `authController.js` |
| Đặt lại mật khẩu | Người yêu cầu | Bấm "Quên mật khẩu" | `authController.js` |
| Admin hỗ trợ đặt lại mật khẩu | Tài khoản được chọn | Admin bấm trong trang Tài khoản | `adminController.js` |
| Thư mời sinh viên (kèm mật khẩu tạm) | Tài khoản sinh viên do admin import | Worker nền sau khi import | `welcomeEmailWorker.js` |
| Thư mời doanh nghiệp (kèm mật khẩu tạm) | Tài khoản doanh nghiệp do admin import | Worker nền sau khi import | `welcomeEmailWorker.js` |
| Gợi ý việc làm theo AI | Ứng viên | Cron theo lịch admin đặt | `cronJob.js` |
| Thông báo việc làm theo từ khoá | Ứng viên có tạo thông báo | Cùng lượt cron | `cronJob.js` |
| Tổng hợp hồ sơ phù hợp | Doanh nghiệp | Cron riêng, mặc định 15h hằng ngày | `cronJob.js` |
| Nhắc hạn tin tuyển dụng | Doanh nghiệp | Cron riêng, mặc định 9h hằng ngày | `cronJob.js` |
| Thông báo toàn hệ thống | Nhóm admin chọn | Admin gửi broadcast có tick "Gửi email" | `broadcastWorker.js` |

Tất cả đi qua một đường duy nhất: `backend/src/services/emailService.js` →
SMTP relay của Brevo. Lời văn của mọi mẫu thư sửa được ở **Quản trị → Nội dung
email** (lưu trong database, không cần deploy lại).

### Ai KHÔNG nhận được thư

Áp dụng cho mọi email định kỳ và thư mời, không phải chỉ một vài loại:

| Trường hợp | Kết quả |
|---|---|
| Tài khoản bị khoá (`status: banned`) | Không nhận bất cứ thư nào, kể cả broadcast |
| Tài khoản đã xoá mềm (`isDeleted`) | Như trên |
| Chưa xác thực email (`emailVerified === false`) | Không nhận email định kỳ — login cũng đang chặn họ |
| Ứng viên tắt "Email gợi ý việc làm" | Không nhận gợi ý việc làm |
| Doanh nghiệp tắt "Tần suất nhận email" (`off`) | Không nhận email tổng hợp hồ sơ |
| Doanh nghiệp chọn "Hằng tuần" | Chỉ nhận mỗi tuần một lần, và thư gom hồ sơ cả tuần |
| Doanh nghiệp tắt "Nhắc hạn tin tuyển dụng" | Không nhận thư nhắc hạn |
| Sinh viên / doanh nghiệp đã tự đổi mật khẩu | Không nhận lại thư mời — gửi mật khẩu tạm mới sẽ đè lên mật khẩu họ đang dùng |

Broadcast cố ý **không** xét công tắc "Email gợi ý việc làm": đó là thông báo vận
hành của hệ thống (bảo trì, đổi chính sách), còn công tắc kia chỉ nói về thư gợi
ý việc làm.

---

## 1. Lấy SMTP key

Bạn đã có tài khoản Brevo, nên bỏ qua phần đăng ký.

**1.1** Bấm **biểu tượng bánh răng** ở góc trên bên phải (nằm giữa dấu **?** và
chuông thông báo). Một bảng **Settings** mở ra, có thanh điều hướng riêng bên trái
chia theo nhóm:

```
Personal settings     Profile · General · Language · Individual email
Organization settings Users · Senders, domains, IPs · SMTP & API ·
                      Aura AI control center · Security · Localization ·
                      Deliverability Center · UTM parameters
Data Management       Custom objects · Data feeds
CRM                   Contacts · Companies · Deals
Marketing             Campaigns
```

Chọn **SMTP & API** trong nhóm **Organization settings**.

> Đừng tìm trong mục **Transactional** ở thanh biểu tượng ngoài cùng bên trái.
> Mục đó là nơi xem thống kê và nhật ký thư đã gửi, không phải nơi lấy khoá.

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

> **Chưa sở hữu tên miền nào?** Bỏ qua cả mục này, làm theo mục 2.6 ở cuối.

**2.1** Bánh răng → **Settings** → **Senders, domains, IPs** (nhóm *Organization
settings*) → thêm tên miền. Đường link trực tiếp:
<https://app.brevo.com/senders/domain/add>

Wizard có 4 bước, hiện ở đầu trang:

```
1 Domain  →  2 Branded subdomain  →  3 Setup method  →  4 Records
```

**2.2 — Bước Domain.** Ô **Domain name**, nhập:

```
cvoneclickmatch.com
```

Không gõ `http://`, `https://` hay `www`. Bấm **Continue**.

> **Vì sao dùng tên miền gốc chứ không phải `send.cvoneclickmatch.com`?**
> Brevo cảnh báo tên miền gửi không nên đang được dùng cho dịch vụ email khác.
> Kiểm tra DNS thực tế của `cvoneclickmatch.com` cho thấy **chưa có bản ghi MX
> nào và chưa có bản ghi TXT nào** — tức tên miền chưa nhận thư và chưa có SPF
> của dịch vụ nào khác. Không có xung đột, nên dùng thẳng tên miền gốc được, và
> địa chỉ gửi cũng gọn hơn.
>
> Chỉ chuyển sang tên miền con nếu sau này bạn gắn Google Workspace / Zoho Mail
> vào `cvoneclickmatch.com`, hoặc muốn tách uy tín gửi thư khỏi tên miền chính.

**2.3 — Bước Branded subdomain.** Tên miền con này dùng cho link theo dõi và ảnh
trong thư, để người nhận thấy tên miền của bạn thay vì tên miền của Brevo. Nhận
giá trị Brevo đề xuất là được.

**2.4 — Bước Setup method.** Tiêu đề trang: *"How do you want to set up
cvoneclickmatch.com?"*, khối **1. Choose how the records will be added** có ba thẻ:

| Thẻ | Brevo mô tả | Nghĩa thật |
|---|---|---|
| **Automatic** *(Recommended)* | Brevo kết nối vào nhà cung cấp DNS và tự thêm bản ghi, thường dưới một phút | Bạn cấp cho Brevo quyền **ghi** vào DNS của tên miền |
| **Manual** | Brevo hiện danh sách bản ghi để bạn tự copy sang nhà cung cấp DNS | Bạn tự dán vào Cloudflare, Brevo không đụng gì tới DNS |
| **Delegate** | Gửi link bảo mật cho người quản trị DNS để họ tự làm | Dùng khi DNS do người khác quản |

**Chọn Manual.**

Brevo gợi ý *Automatic*, và lựa chọn đó không sai — nhưng với trường hợp của bạn,
**Manual** hợp hơn vì ba lý do:

- Chỉ có 3–4 bản ghi phải thêm. Lợi thế "dưới một phút" của Automatic gần như
  không đáng kể.
- Automatic cần quyền ghi vào toàn bộ DNS của `cvoneclickmatch.com`, trong khi
  việc cần làm chỉ là thêm vài bản ghi TXT/CNAME. Quyền đó bao gồm cả bản ghi A
  đang trỏ website của bạn.
- **Website của bạn đang chạy trên chính tên miền này.** Sai một bản ghi DNS là
  cả trang sập. Tự dán thì bạn nhìn thấy chính xác mình đang thêm gì.

*Delegate* không dùng đến vì bạn tự quản Cloudflare.

> Trên màn hình còn một khối nữa bên dưới (đánh số **2.**). Cuộn xuống xem hết
> rồi mới bấm **Continue**.

**2.5 — Bước Records.** Brevo liệt kê các bản ghi cần thêm. Mở Cloudflare ở tab
khác: Dashboard → `cvoneclickmatch.com` → **DNS** → **Add record**.

> ### Ba điều phải nhớ trước khi gõ gì
>
> **1. Đổi `Type` TRƯỚC TIÊN.** Hộp thoại mở mặc định ở `Type = A` với ô
> **IPv4 address** và **Proxy status = Proxied**. Bản ghi xác thực email của Brevo
> **không có cái nào là loại A**. Chọn đúng loại (thường là `TXT`) thì ô
> *IPv4 address* tự đổi thành **Content**, và công tắc Proxy **biến mất** —
> Cloudflare không cho proxy bản ghi TXT.
>
> **2. Bản ghi `CNAME` PHẢI để DNS only.** Công tắc Proxy vẫn hiện với CNAME và
> mặc định **bật** (đám mây cam). Gạt về **DNS only** (đám mây xám).
>
> Đây là lỗi gần như chắc chắn sẽ gặp nếu bỏ qua. Bật proxy thì Cloudflare "làm
> phẳng" CNAME và trả về IP anycast của chính nó thay cho giá trị bạn đặt. Brevo
> tra ra IP Cloudflare, không thấy giá trị mong đợi, và báo:
>
> *"The Branded record values in Brevo and in your domain provider account
> mismatch."*
>
> Tính năng branded subdomain tạo ra **ba** bản ghi CNAME, cả ba đều mặc định
> bật proxy và đều phải gạt về DNS only:
>
> | Name | Target |
> |---|---|
> | `noreply` | `noreply-<tên-miền>.brand.brevosend.com` |
> | `img.noreply` | `noreply-<tên-miền>.img.brand.brevosend.com` |
> | `r.noreply` | `noreply-<tên-miền>.r.brand.brevosend.com` |
>
> Brevo báo lỗi riêng cho từng cái: *"Branded record ... mismatch"* và
> *"Redirection Record ... mismatch"*.
>
> Nhận biết: cả ba trả về **đúng một cặp IP giống hệt website chính**, và truy
> vấn CNAME thì **không có CNAME nào**:
> ```bash
> nslookup -type=CNAME noreply.cvoneclickmatch.com   # phải thấy ...brand.brevosend.com
> nslookup noreply.cvoneclickmatch.com               # nếu ra IP giống web chính -> đang bị proxy
> ```
>
> Cách gạt: mở dòng đó ra, ở cột **Proxy status** bấm công tắc xanh bên trái đám
> mây cam. Đám mây chuyển sang xám và chữ thành **DNS only**, rồi bấm **Save**.
> Giá trị ở ô Target giữ nguyên, không sửa gì.
>
> **3. Đừng đụng vào các bản ghi đang có.** Tên miền này đang chạy website và API
> trên Railway:
> ```
> cvoneclickmatch.com          www.cvoneclickmatch.com      api.cvoneclickmatch.com
> _railway-verify.*  (3 bản ghi xác minh của Railway)
> ```
> Chỉ **thêm mới**, không sửa, không xoá. Sửa nhầm mấy dòng trên là sập trang.

**Điền ô Name như thế nào:** Cloudflare tự thêm phần `.cvoneclickmatch.com` phía
sau, nên chỉ gõ phần đầu:

| Brevo yêu cầu đặt tại | Gõ vào ô Name |
|---|---|
| Chính tên miền gốc | `@` |
| `mail._domainkey.cvoneclickmatch.com` | `mail._domainkey` |
| `_dmarc.cvoneclickmatch.com` | `_dmarc` |

Thêm bản ghi TXT ở `@` **không ảnh hưởng** tới bản ghi A của website — một tên
có thể mang nhiều bản ghi khác loại cùng lúc.

**Về khối Recommendations của Cloudflare.** Cloudflare hiện dòng *"Email cannot
reach @cvoneclickmatch.com addresses and they could be spoofed — Add an MX record
to receive email. Set up SPF, DKIM, and DMARC records to prevent email spoofing."*
Đây là gợi ý chung, Cloudflare không biết bạn đang cấu hình Brevo:

| Cloudflare khuyên | Cần làm |
|---|---|
| Thêm **MX** | **Bỏ qua.** MX để *nhận* thư; ở đây chỉ *gửi* đi |
| **DMARC** | Brevo đã đưa bản ghi, thêm theo bước Records là xong |
| **SPF** / **DKIM** | **Đừng tự viết tay.** Luồng branded subdomain xử lý qua vùng `brand.brevosend.com` được uỷ quyền — chính là ba CNAME ở trên. Thêm tay có thể xung đột |

Xong Brevo rồi hãy kiểm tra lại. Nếu thiếu SPF thật và thư vào spam thì mới thêm
`v=spf1 include:spf.brevo.com ~all`.

**Kiểm tra sau khi thêm** (chờ 1–2 phút cho DNS lan):

```bash
nslookup -type=TXT cvoneclickmatch.com
nslookup -type=TXT mail._domainkey.cvoneclickmatch.com
nslookup -type=TXT _dmarc.cvoneclickmatch.com
```

Thấy đúng giá trị đã dán thì quay lại Brevo bấm nút xác thực. DNS lan truyền
thường mất vài phút, có thể tới vài giờ — Brevo cho thử lại trong vòng 48 giờ cho
đến khi tên miền hiện trạng thái **Authenticated**.

**2.6 — Đặt `SENDER_EMAIL`.** Địa chỉ gửi phải thuộc đúng tên miền vừa xác thực:

```
SENDER_EMAIL=CVMatchOne <no-reply@cvoneclickmatch.com>
```

> **Chưa có tên miền riêng?** Vẫn gửi được để chạy thử: Settings →
> **Senders, domains, IPs** → phần **Senders** → thêm một người gửi bằng địa chỉ
> Gmail của bạn, rồi bấm xác nhận trong thư Brevo gửi tới. Đặt `SENDER_EMAIL`
> đúng địa chỉ Gmail đó.
>
> Cách này chỉ hợp để chạy thử. Gửi hàng loạt sẽ vào spam vì tên miền gửi
> (`gmail.com`) không phải của bạn và không có DKIM của bạn — đúng thứ mà quy định
> Gmail/Yahoo từ 2024 nhắm vào.

---

## 3. Đặt biến môi trường trên Railway

Railway → service **backend** → tab **Variables** → thêm 5 biến:

```
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=<SMTP login dạng xxxxxx@smtp-brevo.com>
EMAIL_PASS=<SMTP key bắt đầu bằng xsmtpsib->
SENDER_EMAIL=CVMatchOne <no-reply@cvoneclickmatch.com>
```

**Kiểm tra luôn ba biến này** — chúng quyết định link bên trong email:

```
FRONTEND_URL=https://cvoneclickmatch.com
CLIENT_ORIGIN=https://cvoneclickmatch.com,https://www.cvoneclickmatch.com
```

`FRONTEND_URL` là nơi dựng mọi đường dẫn trong thư (đặt lại mật khẩu, xem việc
làm). Nếu nó còn là `localhost`, thư vẫn gửi đi bình thường nhưng người nhận bấm
vào link sẽ không mở được gì — hỏng mà không có dấu hiệu nào. Hệ thống nay cảnh
báo trường hợp này ở `/health` (`email.linkOrigin` và `email.warnings`).

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
  "sender": "CVMatchOne <no-reply@cvoneclickmatch.com>",
  "linkOrigin": "https://cvoneclickmatch.com",
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
| Nhận được thư nhưng bấm link không mở được | `FRONTEND_URL` còn là localhost | Đặt `FRONTEND_URL=https://cvoneclickmatch.com` rồi Restart |
| Brevo báo *"Branded record ... mismatch"* hoặc *"Redirection Record ... mismatch"* | Bản ghi CNAME đang bật proxy Cloudflare | Gạt **cả ba** bản ghi `noreply`, `img.noreply`, `r.noreply` về **DNS only**, đợi 1–2 phút rồi Refresh trang Domains |
| Ba lỗi mismatch **thay nhau** hiện dù CNAME đã đúng | Đích `*.brand.brevosend.com` của Brevo đang SERVFAIL (`ns1.sendinblue.com` trả về REFUSED) — lỗi phía Brevo | Ngừng sửa DNS. Kiểm tra bằng lệnh bên dưới để chắc phía mình đúng, rồi chờ và Verify lại; quá lâu thì báo hỗ trợ Brevo kèm bằng chứng |

### Tự phân biệt lỗi phía mình hay phía Brevo

```bash
# 1. Bản ghi của MÌNH có đúng không (phải ra tên ...brand.brevosend.com)
nslookup -type=CNAME noreply.cvoneclickmatch.com 8.8.8.8
nslookup -type=CNAME img.noreply.cvoneclickmatch.com 8.8.8.8
nslookup -type=CNAME r.noreply.cvoneclickmatch.com 8.8.8.8

# 2. Đích phía BREVO có phân giải được không
nslookup noreply-cvoneclickmatch-com.brand.brevosend.com 8.8.8.8
```

Lệnh 1 ra đúng tên mà lệnh 2 báo `SERVFAIL` → phía bạn xong, đang chờ Brevo.
Lệnh 1 ra địa chỉ IP thay vì tên → CNAME còn bật proxy, quay lại mục 2.5.

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
- [Brevo — Set up your domain in Brevo](https://help.brevo.com/hc/en-us/articles/35337929909778-Set-up-your-domain-in-Brevo)
- [Brevo — FAQs about branded subdomains](https://help.brevo.com/hc/en-us/articles/35946791638802-FAQs-About-branded-subdomains)
- [Brevo — Limits of the Free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo — Comply with Gmail, Yahoo and Microsoft sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
