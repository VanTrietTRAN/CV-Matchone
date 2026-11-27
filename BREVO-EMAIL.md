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

### Ba làn ưu tiên (chi tiết ở mục 9)

| Làn | Gồm | Trần/ngày | Nhịp gửi | Khi Circuit Breaker ngắt |
|---|---|---|---|---|
| **P0 · Bảo mật** | Mã xác thực, đặt lại mật khẩu, admin hỗ trợ đặt lại | 60 giữ riêng (mượn được 60 đệm) | Gửi ngay | **Vẫn gửi** |
| **P1 · Thư mời** | Thư mời sinh viên, doanh nghiệp | 100 | 20 thư/giờ, giãn 60–90 giây | Dừng |
| **P2 · Gợi ý** | Gợi ý việc làm, thông báo từ khoá, tổng hợp hồ sơ, nhắc hạn tin, broadcast | 80 | 15 thư/giờ, chỉ 09:00–17:00 | Dừng |

Tổng trần mềm **240/300**: 60 lượt để trống làm vùng đệm. P1 và P2 nghỉ Chủ nhật.
Ba tuần đầu sau khi triển khai chạy theo lộ trình warm-up (110 → 170 → 210 → 240).

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
| Đã nhận đủ 1 thư mời + 1 thư nhắc | Import lại cũng không gửi thêm; thư nhắc phải cách thư mời ≥ 7 ngày |
| Không đăng nhập/dùng hệ thống trong 30 ngày (14 ngày ở tuần 2 warm-up) | Không nhận thư làn P2 (gợi ý, tổng hợp, nhắc hạn, email broadcast) |
| Địa chỉ trong danh sách chặn (hard bounce, báo spam, huỷ nhận, Brevo chặn) | Không nhận thư P1/P2. Thư P0 người dùng tự yêu cầu vẫn gửi |

Broadcast cố ý **không** xét công tắc "Email gợi ý việc làm": đó là thông báo vận
hành của hệ thống (bảo trì, đổi chính sách), còn công tắc kia chỉ nói về thư gợi
ý việc làm. Thông báo trong ứng dụng tới mọi tài khoản; riêng **email** broadcast
đi làn P2 nên chỉ tới người hoạt động gần đây và không quá sức gửi của 48 giờ.

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

Railway → service **backend** → tab **Variables** → thêm 6 biến:

```
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=<SMTP login dạng xxxxxx@smtp-brevo.com>
EMAIL_PASS=<SMTP key bắt đầu bằng xsmtpsib->
SENDER_EMAIL=CVMatchOne <no-reply@cvoneclickmatch.com>
REPLY_TO=CVMatchOne <support@cvoneclickmatch.com>
```

`REPLY_TO` là nơi nhận khi người dùng bấm **Trả lời**. Chỉ đặt sau khi hộp thư
đó đã nhận được thư thật (mục 8.3), nếu không câu trả lời vẫn bị trả lại.

Thêm các biến cho 3 làn và Circuit Breaker (mục 9):

```
SECURITY_SENDER_EMAIL=CVMatchOne <security@cvoneclickmatch.com>
API_PUBLIC_URL=https://<địa chỉ public của backend>
BREVO_WEBHOOK_TOKEN=<chuỗi ngẫu nhiên dài, cũng dán vào webhook Brevo>
EMAIL_ALERT_TELEGRAM_BOT_TOKEN=...   # hoặc EMAIL_ALERT_SLACK_WEBHOOK=...
EMAIL_ALERT_TELEGRAM_CHAT_ID=...
```

`SECURITY_SENDER_EMAIL` phải cùng tên miền đã xác thực (mục 2). `API_PUBLIC_URL`
là địa chỉ **backend** (không phải frontend) — link huỷ nhận trong header
`List-Unsubscribe` trỏ thẳng vào đó.

**Kiểm tra luôn ba biến này** — chúng quyết định link bên trong email:

```
FRONTEND_URL=https://cvoneclickmatch.com
CLIENT_ORIGIN=https://cvoneclickmatch.com,https://www.cvoneclickmatch.com
```

`FRONTEND_URL` là nơi dựng mọi đường dẫn trong thư (đặt lại mật khẩu, xem việc
làm). Nếu nó còn là `localhost`, thư vẫn gửi đi bình thường nhưng người nhận bấm
vào link sẽ không mở được gì — hỏng mà không có dấu hiệu nào. Hệ thống nay cảnh
báo trường hợp này ở trang Quản trị → Hệ thống (`email.linkOrigin` và `email.warnings`).

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

**Lưu ý quota:** cron không gửi thẳng nữa mà **xếp hàng** vào outbox làn P2 (tối
đa 80 thư/ngày, chỉ 09:00–17:00). Mỗi lượt cron chỉ xếp tối đa bằng sức gửi của 48
giờ; người lâu chưa nhận thư gợi ý xếp trước, nên khi trần không đủ thì mỗi lượt
tới một nhóm khác. Thư quá 48 giờ chưa tới lượt thì tự huỷ thay vì dồn sang tuần
sau. Lịch dày hơn không làm gửi được nhiều hơn — chỉ làm thư cũ bị thay bởi thư mới.

---

## 5. Kiểm tra — theo đúng thứ tự này

### Bước 1 — Cấu hình có đọc được không (không gửi gì)

Đăng nhập admin → **Hệ thống** → khối **Máy chủ gửi mail (SMTP)**. Dữ liệu lấy từ
`GET /api/admin/system` (chỉ admin). `/health` công khai nay chỉ trả trạng thái
sống/chết và database — không còn lộ cấu hình SMTP ra ngoài.

Trường `email` trong phản hồi:

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

Bấm nút **Kiểm tra kết nối SMTP** trong admin → **Hệ thống**
(`GET /api/admin/system/email-check`). Có `"ok": true` là thông tin đăng nhập dùng được.

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

## 8. Khi thư vào spam

Kiểm tra DNS ngày 18/11/2026: `brevo-code`, DKIM (`brevo1`/`brevo2._domainkey`),
DMARC, SPF của tên miền trả thư `noreply.cvoneclickmatch.com` và ba CNAME branded
đều **đúng và phân giải được**. Xác thực không phải nguyên nhân. Nghi phạm chính
là **tên miền còn mới** (đăng ký 17/08/2026) gửi từ **IP dùng chung** của gói Free
— Gmail chưa có lịch sử để tin.

Code đã xử lý phần của mình: mọi thư có thêm bản văn bản thuần, gửi qua pool kết
nối, và có `Reply-To` khi đặt `REPLY_TO`. Ba việc dưới đây phải làm bằng tài khoản
của bạn.

### 8.1 Đọc "Show original" của một thư bị vào spam

Đây là bằng chứng duy nhất cho biết Gmail thực sự thấy gì.

1. Mở Gmail **trên máy tính** (ứng dụng điện thoại không có chức năng này).
2. Vào **Spam**, mở một thư của CVMatchOne.
3. Bấm dấu **⋮** cạnh nút Trả lời → **Show original** (*Hiển thị bản gốc*).
4. Bảng đầu trang có ba dòng, cần cả ba là **PASS**:

| Dòng | PASS nghĩa là | FAIL thì |
|---|---|---|
| **SPF** | Brevo được phép gửi thay tên miền | Kiểm tra TXT của `noreply.cvoneclickmatch.com` |
| **DKIM** | Chữ ký có `d=cvoneclickmatch.com` hợp lệ | Kiểm tra hai CNAME `brevo1`/`brevo2._domainkey` |
| **DMARC** | Một trong hai cái trên khớp tên miền ở dòng From | Xem dòng DKIM có ghi `cvoneclickmatch.com` hay tên miền Brevo |

Cả ba PASS mà vẫn vào spam → nguyên nhân là uy tín (8.2, 8.4), không phải cấu hình.

Gửi kèm toàn bộ nội dung trang (nút **Copy to clipboard**) khi nhờ người khác xem —
trong đó có dòng `Received: from ...` cho biết IP Brevo đã dùng.

### 8.2 Google Postmaster Tools

Cho biết Gmail chấm uy tín tên miền ra sao và tỉ lệ bị người nhận báo spam.

1. Vào <https://postmaster.google.com>, đăng nhập bằng một tài khoản Google bất kỳ.
2. Bấm **+** (hoặc **Get started**), nhập `cvoneclickmatch.com`.
3. Google đưa một bản ghi dạng `google-site-verification=xxxxxxxx`.
4. Cloudflare → `cvoneclickmatch.com` → **DNS** → **Add record**:
   `Type = TXT`, `Name = @`, `Content =` giá trị vừa copy. **Save**.
   Bản ghi `brevo-code` đang có ở `@` giữ nguyên — một tên mang được nhiều TXT.
5. Quay lại Postmaster bấm **Verify**.

> Biểu đồ chỉ có số liệu khi tên miền gửi tới Gmail **đủ nhiều mỗi ngày**. Google
> không công bố ngưỡng cụ thể; lượng nhỏ thì các biểu đồ sẽ trống. Trống không có
> nghĩa là cấu hình sai.

### 8.3 Hộp thư nhận trả lời (`REPLY_TO`)

Thư gửi từ `no-reply@cvoneclickmatch.com`, và tên miền gốc không có MX, nên người
nhận bấm **Trả lời** là thư bị trả lại — trong khi thư mời doanh nghiệp lại viết
*"vui lòng phản hồi lại email này"*. Cloudflare Email Routing tạo miễn phí một địa
chỉ `support@cvoneclickmatch.com` chuyển tiếp về Gmail của bạn.

1. Cloudflare → `cvoneclickmatch.com` → **Email** → **Email Routing** → bật lên.
   Cloudflare đề nghị thêm bản ghi **MX** và một **TXT SPF** ở tên miền gốc → đồng ý.
2. Tab **Destination addresses** → thêm Gmail nhận thư → bấm link xác nhận
   Cloudflare gửi tới Gmail đó.
3. Tab **Routing rules** → **Create address**: `support` → **Send to an email** →
   chọn Gmail vừa xác nhận.
4. Từ một Gmail khác, gửi thử tới `support@cvoneclickmatch.com`. Nhận được mới đi tiếp.
5. Railway → **Variables** → `REPLY_TO=CVMatchOne <support@cvoneclickmatch.com>` →
   **Restart**. Trang Hệ thống hết cảnh báo REPLY_TO là xong.

> **Có ảnh hưởng tới Brevo không?** Không. MX và SPF mới nằm ở tên miền gốc; thư
> Brevo dùng tên miền trả thư `noreply.cvoneclickmatch.com` với SPF riêng, còn
> DMARC đạt nhờ DKIM. Có MX còn giúp tên miền gửi trông "thật" hơn với bộ lọc.
> Chỉ thêm mới, không sửa bản ghi nào đang có (xem cảnh báo ở mục 2.5).

### 8.4 Làm ấm tên miền

Uy tín tích luỹ theo **tuần**, không phải theo vài lượt bấm.

- Giữ lượng gửi đều, tăng dần. Tránh dồn hàng trăm thư một lúc khi tên miền còn
  mới — chia đợt import ra nhiều ngày nếu được.
- Nhờ vài người quen: tìm thư trong Spam → **Báo cáo không phải thư rác** → trả lời
  vài chữ (cần 8.3 xong trước, không thì câu trả lời bị trả lại). Việc này giúp
  ngay cho chính hộp thư đó và góp một phần vào uy tín chung — không phải công tắc
  đưa mọi thư vào Inbox.
- Tiêu đề quảng cáo (*"siêu phù hợp! 🎉"*) bị trừ điểm hơn tiêu đề thông tin.
  Sửa được ở **Quản trị → Nội dung email**.

---

## 9. Phân luồng 3 làn và Circuit Breaker

Thư từng rơi vào Spam không phải vì mốc 300 thư/ngày, mà vì **chạy kịch trần
nhiều ngày liền** bằng danh sách import lạnh và hàng đợi gợi ý tràn, trộn chung
với thư đổi mật khẩu. Mã nguồn: `backend/src/services/mail/` (`policy.js` chứa mọi
con số và ngưỡng).

### 9.1 Lộ trình warm-up

| Bậc | P0 | P1 | P2 | Tổng | Ghi chú |
|---|---|---|---|---|---|
| Tuần 1 | 60 | 50 | 0 | 110 | Tắt P2, lọc sạch danh sách |
| Tuần 2 | 60 | 70 | 40 | 170 | P2 chỉ cho người dùng 14 ngày |
| Tuần 3 | 60 | 90 | 60 | 210 | |
| Tuần 4+ | 60 | 100 | 80 | 240 | Vận hành ổn định |

Hệ thống bắt đầu ở tuần 1 và **tự lên bậc** sau mỗi 7 ngày nếu 7 ngày đó có hard
bounce < 2%, không có báo cáo spam và breaker đang đóng. Đổi bậc tay ở **Quản trị →
Hệ thống → Đường gửi mail**, hoặc ép bằng `EMAIL_WARMUP_STAGE=4` (tắt warm-up).

Gói trả phí: đặt `EMAIL_PROVIDER_DAILY_LIMIT` — mọi trần co giãn theo cùng tỉ lệ.

### 9.2 Circuit Breaker

| Tín hiệu | Giảm tốc (THROTTLED, 6h) | Ngắt (OPEN) |
|---|---|---|
| Báo cáo spam | — | ≥ 1 / 24h → nghỉ 72h |
| Hard bounce | ≥ 3 / 24h | ≥ 6 / 24h → nghỉ 24h |
| Deferred / soft bounce | ≥ 5 và > 8% trong 1 giờ | ≥ 5 và > 15% trong 1 giờ → nghỉ 24h |
| Lỗi SMTP 421/451/550 liên tiếp | 2 lỗi | 3 lỗi → nghỉ 12h |

- **THROTTLED:** tắt P2, P1 còn 50% và 1 thư/2 phút.
- **OPEN:** dừng P1 và P2. Hết giờ nghỉ → **HALF_OPEN**: gửi thăm dò tối đa 20 thư;
  sạch 24h thì tự đóng, có spam/hard bounce thì ngắt lại.
- **P0 không bao giờ bị ngắt.**
- Địa chỉ spam/hard bounce/huỷ nhận vào danh sách chặn (`email_suppression_list`).
- Lô import có ≥ 3 hard bounce trong 24h bị **dừng riêng** (mỗi file import một mã
  lô); các lô sạch vẫn chạy. Rà lại file rồi bấm **Mở lại** ở trang Hệ thống.
- Mỗi lần ngắt gửi cảnh báo Telegram/Slack (nếu đặt biến) và Sentry.

### 9.3 Bật webhook Brevo

Không có webhook thì breaker chỉ thấy lỗi SMTP trả về ngay, **không** thấy báo cáo
spam hay hard bounce (hai tín hiệu quan trọng nhất).

1. Đặt `BREVO_WEBHOOK_TOKEN` trên Railway (vd. `openssl rand -hex 32`), Restart.
2. Brevo → **Transactional** → **Settings** → **Webhook** → **Add a new webhook**:
   - URL: `https://<backend>/webhooks/brevo`
   - Sự kiện: *Hard bounce, Soft bounce, Blocked, Spam, Invalid email, Deferred,
     Unsubscribed* (thêm *Delivered* nếu muốn thống kê).
   - Xác thực: **Bearer token** = giá trị `BREVO_WEBHOOK_TOKEN`
     (hoặc Basic auth với mật khẩu = token).
3. Kiểm tra: trang Hệ thống không còn cảnh báo "Chưa đặt BREVO_WEBHOOK_TOKEN";
   gọi thử không kèm token phải nhận `401`.

> Chưa đối chiếu bằng ảnh giao diện Brevo: nếu form tạo webhook không có ô xác
> thực, tạo bằng API `POST https://api.brevo.com/v3/webhooks` với
> `{"type":"transactional","url":"...","events":[...],"auth":{"type":"bearer","token":"..."}}`.
> Endpoint từ chối mọi sự kiện khi chưa đặt token — ai cũng gửi được sự kiện "spam"
> giả thì ai cũng tắt được đường gửi mail.

### 9.4 Lọc trước khi import

Bản xem trước và lần chạy thật đều: chuẩn hoá (trim, viết thường), loại tên miền
gõ nhầm (`gmial.com`, `gmai.com`…), loại tên miền không có bản ghi MX, bỏ qua địa
chỉ trong danh sách chặn. DNS chập chờn thì chỉ cảnh báo, không chặn.

### 9.5 Huỷ nhận một chạm (RFC 8058)

Thư P2 mang header `List-Unsubscribe` + `List-Unsubscribe-Post` (cần
`API_PUBLIC_URL`). Gmail hiện nút "Huỷ đăng ký" cạnh tên người gửi — người nhận bấm
nút đó thay vì "Báo cáo spam". Link mở bằng trình duyệt chỉ hiện trang xác nhận,
không huỷ ngay (trình quét link của hộp thư tự mở mọi link trong thư).

---

## 10. Nguồn tham khảo

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
