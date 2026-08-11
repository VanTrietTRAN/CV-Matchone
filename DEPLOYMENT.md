# Kế hoạch Deploy — Smart Recruit

**Hạ tầng đích**

| Thành phần | Nền tảng | Domain |
|---|---|---|
| Frontend (Next.js) | Railway Pro — service `frontend` | `cvoneclickmatch.com`, `www.cvoneclickmatch.com` |
| Backend (Express) | Railway Pro — service `backend` | `api.cvoneclickmatch.com` |
| AI (FastAPI) | Railway Pro — service `ai` | *không có domain public* — chỉ gọi qua private network |
| Database | MongoDB Atlas | — |
| Lưu file CV | Cloudflare R2 (bucket private + presigned URL) | — |
| Email | Brevo SMTP | gửi từ `@cvoneclickmatch.com` |
| DNS | Cloudflare | `cvoneclickmatch.com` |

**Sơ đồ luồng**

```
Trình duyệt ──HTTPS──> cvoneclickmatch.com        (frontend, Railway)
     │
     └──HTTPS + cookie──> api.cvoneclickmatch.com  (backend, Railway)
                              │
                              ├──private IPv6──> ai.railway.internal:8000
                              ├──TLS──────────> MongoDB Atlas
                              ├──HTTPS────────> Cloudflare R2 (S3 API)
                              ├──SMTP 587─────> smtp-relay.brevo.com
                              └──HTTPS────────> Gemini API · Groq API
```

---

## Phase 0 — Chuẩn bị code ✅ ĐÃ HOÀN THÀNH

Ghi lại để review và để biết vì sao code hiện tại như vậy.

### 0.1 `CLIENT_ORIGIN` bị dùng cho hai mục đích xung khắc — **blocker, đã sửa**

`server.js` tách `CLIENT_ORIGIN` theo dấu phẩy để làm allowlist CORS, nhưng `authController.js`
lại dùng nguyên chuỗi đó làm base URL redirect sau OAuth. Đặt
`CLIENT_ORIGIN=https://cvoneclickmatch.com,https://www.cvoneclickmatch.com` sẽ khiến đăng nhập
Google/Facebook redirect tới URL rác
`https://cvoneclickmatch.com,https://www.cvoneclickmatch.com/candidate/dashboard?oauth=success`.

**Đã sửa:** thêm [`backend/src/utils/frontendUrl.js`](backend/src/utils/frontendUrl.js) với hàm
`frontendOrigin()`:

1. ưu tiên `FRONTEND_URL`
2. nếu trống thì lấy **origin đầu tiên** trong `CLIENT_ORIGIN` (môi trường cũ vẫn chạy được)
3. cuối cùng mới về `http://localhost:3000`
4. luôn cắt dấu `/` thừa ở cuối

Hàm này thay cho 5 chỗ tự đọc env trước đây: 2 chỗ redirect OAuth (`googleCallback`,
`facebookCallback`), link đặt lại mật khẩu, email broadcast của admin, và 2 template trong
`emailService.js`.

### 0.2 AI service bind IPv6 cho private network — **đã sửa**

Private network của Railway là **IPv6-only**, uvicorn mặc định bind `127.0.0.1`. Start command
đã được khai báo trong [`ai/railway.json`](ai/railway.json):

```
uvicorn app.main:app --host :: --port $PORT
```

Backend Node không cần sửa — `app.listen(PORT)` đã bind dual-stack.

> **Khi chạy local trên Windows**, `--host ::` chỉ nhận kết nối IPv6 (`http://[::1]:8000`),
> gọi `127.0.0.1` sẽ không thấy. Local cứ dùng lệnh mặc định trong README
> (`uvicorn app.main:app --reload --port 8000`). Trên Linux của Railway thì `::` nhận cả hai.

### 0.3 OCR cho CV scan — **đã sửa**

`cronWorker.js` dùng `pdf2pic` (phụ thuộc **GraphicsMagick** + **Ghostscript**) làm fallback khi
`pdf-parse` không lấy được text. Builder Railway không có sẵn 2 gói này.

Đã thêm [`backend/nixpacks.toml`](backend/nixpacks.toml):

```toml
[phases.setup]
nixPkgs = ["...", "graphicsmagick", "ghostscript"]
```

`"..."` giữ nguyên danh sách gói mặc định rồi mới nối thêm — nếu liệt kê tay sẽ mất luôn Node
runtime. File chỉ có tác dụng khi builder là **NIXPACKS**, và điều này đã được ép trong
`railway.json`.

Worker vốn đã an toàn: lỗi OCR bị bắt bởi `try/catch` bao ngoài, CV retry 3 lần rồi chuyển
`processingStatus = "failed"`, không làm chết cron. Bổ sung thêm một `catch` diễn giải lỗi
thiếu binary cho dễ đọc log thay vì `Command failed`/`ENOENT` khó đoán.

### 0.4 Pin phiên bản runtime — **đã sửa**

- `backend/package.json`, `frontend/package.json` → `"engines": { "node": ">=20.9.0", "npm": ">=10" }`
- `ai/.python-version` → `3.12`

### 0.5 Sentry sample rate — **đã sửa**

4 chỗ đều đang là `1.0` (gửi 100% transaction). Đổi sang phụ thuộc môi trường để dev vẫn debug
được đầy đủ:

| File | Thay đổi |
|---|---|
| `frontend/instrumentation-client.ts` | `tracesSampleRate` → 0.1 khi prod · `replaysSessionSampleRate` → 0.02 khi prod |
| `frontend/sentry.server.config.ts` | `tracesSampleRate` → 0.1 khi prod |
| `frontend/sentry.edge.config.ts` | `tracesSampleRate` → 0.1 khi prod |
| `backend/server.js` | `tracesSampleRate` → 0.1 khi prod, thêm `environment` |

### 0.6 Cấu hình deploy dạng file

Thay vì cấu hình tay trên UI Railway, mỗi service có sẵn `railway.json` (build command, start
command, healthcheck, restart policy). Xem Phase 2.1.

### 0.7 Kết quả kiểm tra

```
frontend  npx tsc --noEmit        → 0 lỗi
frontend  npm run build           → 35/35 route
backend   node --check × 6 file   → OK
backend   require × 5 module      → OK
backend   frontendOrigin()        → 3 trường hợp đều đúng
ai        uvicorn --host ::       → /health 200 trên [::1]
```

---

## Phase 1 — Chuẩn bị dịch vụ bên ngoài

Làm trước khi tạo Railway service, vì Phase 2 cần các key này.

### 1.1 MongoDB Atlas

1. Tạo cluster (khuyến nghị **M10** cho production; M0 free chỉ dùng thử vì không có backup tự động).
2. **Database Access** → tạo user riêng cho app, quyền `readWrite` **chỉ trên database `smart_recruit`**,
   không dùng `atlasAdmin`. Mật khẩu ≥ 24 ký tự, không chứa ký tự cần URL-encode (`@ : / ?`).
3. **Network Access** → Railway không có IP tĩnh, nên phải allowlist `0.0.0.0/0`.
   Bù lại bằng mật khẩu mạnh + user giới hạn quyền + bật audit log.
4. Copy connection string, **nhớ chèn tên database**:
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/smart_recruit?retryWrites=true&w=majority`
5. Bật **Backup** (Atlas Cloud Backup, daily snapshot).

### 1.2 Cloudflare R2

1. Cloudflare Dashboard → **R2** → Create bucket: `smart-recruit-cvs`, location gần VN (APAC).
2. **Giữ bucket ở chế độ private** — không bật Public Access, không gắn custom domain.
   Code đã dùng presigned URL hết hạn 5 phút (`storageService.getSignedDownloadUrl`).
3. **Manage R2 API Tokens** → Create Token:
   - Permission: **Object Read & Write**
   - Scope: chỉ bucket `smart-recruit-cvs`
   - Lưu lại `Access Key ID`, `Secret Access Key`, và **Account ID**
4. Không cần cấu hình CORS: frontend mở CV bằng điều hướng tab mới (`<a target="_blank">`),
   không fetch bằng JS. Chỉ khi nào đổi sang `fetch()` mới phải thêm CORS rule.

### 1.3 Brevo (email)

1. Tạo tài khoản Brevo → **Senders, Domains & Dedicated IPs** → **Domains** → Add domain
   `cvoneclickmatch.com`.
2. Brevo sinh ra bộ bản ghi DNS — **copy giá trị chính xác từ dashboard**, gồm:
   - `TXT @` → `brevo-code=...` (xác minh sở hữu domain)
   - `TXT mail._domainkey` → khoá DKIM
   - `TXT _dmarc` → `v=DMARC1; p=none; rua=mailto:...`
   - SPF: nếu chưa có bản ghi SPF thì thêm `TXT @` → `v=spf1 include:spf.brevo.com ~all`.
     **Nếu domain đã có SPF, phải gộp `include:spf.brevo.com` vào bản ghi cũ** — một domain
     chỉ được có đúng 1 bản ghi SPF.
3. Thêm các bản ghi này ở Phase 3 (cùng lúc với DNS domain), rồi bấm **Verify** trong Brevo.
4. **SMTP & API** → tab **SMTP** → lấy:
   - `Login` (dạng `xxxxxxx@smtp-brevo.com`) → `EMAIL_USER`
   - `SMTP key` → `EMAIL_PASS`
5. Tạo sender `no-reply@cvoneclickmatch.com` và verify.
6. Gói free Brevo giới hạn **300 email/ngày**. Cron gợi ý việc làm chạy hằng ngày cho toàn bộ
   user đã đăng ký nhận mail — ước lượng số user rồi nâng gói nếu cần.

### 1.4 API keys AI

- **Gemini** (embedding): https://aistudio.google.com/app/apikey → `GEMINI_API_KEY`.
  Free tier có rate limit — nếu lượng CV lớn, bật billing để tránh 429.
- **Groq** (bóc tách CV bằng LLM): https://console.groq.com/keys → `GROQ_API_KEY`.

### 1.5 OAuth (nếu bật đăng nhập mạng xã hội)

Redirect URI được backend tự dựng từ `req.protocol` + `Host` header
(`authController.js:163`), nên với domain production giá trị sẽ là:

- Google Cloud Console → Credentials → OAuth client → **Authorized redirect URIs**:
  `https://api.cvoneclickmatch.com/api/auth/google/callback`
- Meta Developers → Facebook Login → **Valid OAuth Redirect URIs**:
  `https://api.cvoneclickmatch.com/api/auth/facebook/callback`
- Đồng thời thêm `https://cvoneclickmatch.com` vào Authorized JavaScript origins (Google).

Chưa cấu hình key thì backend tự tắt OAuth và trả về `?error=oauth_disabled` — không crash.

---

## Phase 2 — Dựng project trên Railway

### 2.1 Tạo project và 3 service

Railway → **New Project** → **Deploy from GitHub repo** → chọn repo Smart Recruit.
Sau đó **Add Service** thêm 2 lần nữa từ cùng repo. Đặt tên: `frontend`, `backend`, `ai`.

Với mỗi service, vào **Settings** và đặt **2 mục** sau — đây là 2 thứ duy nhất phải làm tay,
vì chúng thuộc về service chứ không nằm trong repo:

| Setting | `frontend` | `backend` | `ai` |
|---|---|---|---|
| Root Directory | `/frontend` | `/backend` | `/ai` |
| Watch Paths | `/frontend/**` | `/backend/**` | `/ai/**` |

**Watch Paths rất quan trọng**: không đặt thì mỗi lần push sẽ rebuild cả 3 service.

Phần còn lại (builder, build command, start command, healthcheck, restart policy) đã nằm trong
`railway.json` của từng thư mục và Railway tự đọc — không cần nhập lại trên UI:

| | `frontend` | `backend` | `ai` |
|---|---|---|---|
| Builder | NIXPACKS | NIXPACKS | NIXPACKS |
| Build Command | `npm run build` | *(mặc định)* | *(mặc định)* |
| Start Command | `npm start` | `npm start` | `uvicorn app.main:app --host :: --port $PORT` |
| Healthcheck | `/` | `/health` | `/health` |
| Restart Policy | On failure ×3 | On failure ×3 | On failure ×3 |

> Builder được ép về NIXPACKS vì `backend/nixpacks.toml` (GraphicsMagick + Ghostscript cho OCR)
> chỉ có tác dụng với builder này.

### 2.2 Biến môi trường

**Service `ai`**

| Biến | Giá trị |
|---|---|
| `PORT` | `8000` |
| `GEMINI_API_KEY` | key từ AI Studio |
| `GEMINI_EMBEDDING_MODEL` | `models/gemini-embedding-001` |
| `GEMINI_EMBEDDING_DIMS` | `768` — **đổi số này là phải tạo lại toàn bộ embedding trong DB** |

**Service `backend`**

| Biến | Giá trị |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | *(Railway tự inject — không tự đặt)* |
| `MONGO_URI` | connection string Atlas ở 1.1 |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CLIENT_ORIGIN` | `https://cvoneclickmatch.com,https://www.cvoneclickmatch.com` |
| `FRONTEND_URL` | `https://cvoneclickmatch.com` |
| `AI_SERVICE_URL` | `http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:8000` |
| `GEMINI_API_KEY` | key Gemini |
| `GROQ_API_KEY` | key Groq |
| `EMAIL_HOST` | `smtp-relay.brevo.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | login SMTP Brevo |
| `EMAIL_PASS` | SMTP key Brevo |
| `SENDER_EMAIL` | `Smart Recruit <no-reply@cvoneclickmatch.com>` |
| `R2_ACCOUNT_ID` | Account ID Cloudflare |
| `R2_ACCESS_KEY_ID` | từ R2 API token |
| `R2_SECRET_ACCESS_KEY` | từ R2 API token |
| `R2_BUCKET_NAME` | `smart-recruit-cvs` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(tuỳ chọn)* |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | *(tuỳ chọn)* |
| `SENTRY_DSN` | *(tuỳ chọn)* |
| `COOKIE_DOMAIN` | **không cần đặt.** Cookie do `api.` set và cũng chỉ gửi về `api.` — chỉ dùng biến này nếu sau này có thêm subdomain khác cần đọc cookie |

> `${{ai.RAILWAY_PRIVATE_DOMAIN}}` là reference variable của Railway, tự resolve thành
> `ai.railway.internal`. Private network không có TLS → dùng `http://`, không phải `https://`.

**Service `frontend`**

| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.cvoneclickmatch.com` |
| `NODE_ENV` | `production` |
| `SENTRY_AUTH_TOKEN` | *(tuỳ chọn — chỉ để upload source map)* |

> ⚠️ `NEXT_PUBLIC_*` được **nhúng cứng vào bundle lúc build**. Phải đặt biến này **trước** lần
> build đầu tiên, và mỗi lần đổi giá trị đều phải **redeploy** mới có hiệu lực.

### 2.3 Thứ tự deploy lần đầu

Deploy theo đúng thứ tự để tránh service phụ thuộc bị lỗi:

1. `ai` → chờ healthcheck xanh
2. `backend` → chờ healthcheck xanh (log phải có `Server đang chạy tại port ...` và không có lỗi Mongo)
3. `frontend`

Kiểm tra private network trước khi gắn domain: mở shell của `backend` trên Railway và chạy

```bash
curl http://ai.railway.internal:8000/health
# kỳ vọng: {"status":"ok", ..., "gemini_key_configured":true}
```

Trả `degraded` = thiếu `GEMINI_API_KEY`. Không kết nối được = AI chưa bind `::` (xem 0.2).

---

## Phase 3 — Domain và DNS

### 3.1 Trỏ nameserver về Cloudflare

Tại nhà đăng ký domain `cvoneclickmatch.com`, đổi nameserver sang cặp NS mà Cloudflare cấp khi
Add Site. Chờ propagate (thường 5–30 phút, tối đa 24h).

### 3.2 Thêm custom domain trên Railway

Với từng service: **Settings → Networking → Custom Domain**

| Service | Domain nhập vào Railway |
|---|---|
| `frontend` | `cvoneclickmatch.com` |
| `frontend` | `www.cvoneclickmatch.com` |
| `backend` | `api.cvoneclickmatch.com` |

Railway trả về CNAME target dạng `xxxxx.up.railway.app` cho từng domain.

### 3.3 Tạo bản ghi DNS trên Cloudflare

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` | target của `cvoneclickmatch.com` | **DNS only (mây xám)** |
| CNAME | `www` | target của `www.cvoneclickmatch.com` | **DNS only** |
| CNAME | `api` | target của `api.cvoneclickmatch.com` | **DNS only** |
| TXT | `@` | `brevo-code=...` | — |
| TXT | `@` | `v=spf1 include:spf.brevo.com ~all` | — |
| TXT | `mail._domainkey` | khoá DKIM của Brevo | — |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:...` | — |

Cloudflare hỗ trợ CNAME flattening nên CNAME ở `@` (apex) hợp lệ.

**Về Proxy (mây cam):** để **DNS only** cho tới khi Railway cấp xong chứng chỉ TLS
(status "Active", thường vài phút). Sau đó nếu muốn bật proxy để có WAF/cache, **bắt buộc**
đặt SSL/TLS mode = **Full (strict)**. Để "Flexible" sẽ gây vòng lặp redirect vô hạn.

### 3.4 Redirect www → apex

Cloudflare → **Rules → Redirect Rules**: `www.cvoneclickmatch.com/*` → `https://cvoneclickmatch.com/$1`,
mã 301. Làm vậy chỉ còn một origin chính tắc, giảm rủi ro của mục 0.1.

### 3.5 Sau khi DNS xanh

- Quay lại Brevo bấm **Verify** cho domain → phải hiện "Authenticated".
- Cập nhật redirect URI thật trong Google Cloud Console và Meta Developers (Phase 1.5).
- Kiểm tra lại `CLIENT_ORIGIN` / `FRONTEND_URL` đúng domain production rồi redeploy `backend`.

---

## Phase 4 — Khởi tạo dữ liệu

### 4.1 Tài khoản admin

Public register chặn `role=admin` (hàm `register` trong `authController.js`), và repo chưa có
script tạo admin.
Cách làm:

1. Đăng ký một tài khoản bình thường qua `https://cvoneclickmatch.com/register/candidate`.
2. Vào MongoDB Atlas → Collections → `users` → tìm theo email → sửa `role` thành `"admin"`.
3. Đăng nhập lại, hệ thống tự điều hướng vào `/admin/dashboard`.

> **Tuyệt đối không chạy `node run_seed.js` trên database production** — script này
> drop toàn bộ database (dòng 285) rồi mới tạo dữ liệu mẫu.

### 4.2 Kiểm thử end-to-end

| # | Việc kiểm tra | Kỳ vọng |
|---|---|---|
| 1 | `curl https://api.cvoneclickmatch.com/health` | `{"status":"ok","database":"connected"}` |
| 2 | Mở `https://cvoneclickmatch.com` | Trang chủ render, không lỗi console |
| 3 | Đăng ký ứng viên mới | Vào được `/candidate/cv` |
| 4 | Refresh trang sau đăng nhập | Vẫn đăng nhập (cookie cross-subdomain hoạt động) |
| 5 | Upload CV PDF | Có file trên R2, `processingStatus` chuyển `ready` sau ~30s |
| 6 | Vào `/candidate/matches` | Có điểm % phù hợp, không phải "Chưa chấm" |
| 7 | Đăng ký nhà tuyển dụng + đăng tin | Tin hiện trong danh sách ứng viên |
| 8 | Ứng tuyển một vị trí | Nhà tuyển dụng thấy hồ sơ kèm điểm |
| 9 | Quên mật khẩu | Nhận được email từ `no-reply@cvoneclickmatch.com`, **không rơi vào Spam** |
| 10 | Đăng nhập Google | Quay về đúng dashboard, không dính URL rác (kiểm chứng fix 0.1) |
| 11 | `railway run --service backend node src/scripts/smokeTest.js` | Toàn bộ pass |

Kiểm tra deliverability email: gửi thử tới https://www.mail-tester.com — mục tiêu ≥ 8/10.

---

## Phase 5 — Vận hành

### 5.1 Backup

- **MongoDB**: bật Atlas Cloud Backup (daily). Ngoài ra có sẵn
  `backend/src/scripts/dbBackup.js` để xuất JSON thủ công.
- **R2**: bật Object Versioning trên bucket để chống xoá nhầm file CV.

### 5.2 Giám sát

- Railway: bật **Deployment Notifications** về Slack/Discord.
- Sentry: đã tích hợp sẵn cả FE lẫn BE — chỉ cần đặt `SENTRY_DSN` (BE) và giảm sample rate (0.5).
- Uptime: dùng UptimeRobot/BetterStack ping `https://api.cvoneclickmatch.com/health` mỗi 5 phút.
  Endpoint này trả **503** khi mất kết nối Mongo nên cảnh báo sẽ chính xác.

### 5.3 Điểm cần theo dõi sát trong tuần đầu

| Rủi ro | Dấu hiệu | Xử lý |
|---|---|---|
| Gemini rate limit | Log `429`, CV kẹt ở `processing` | Bật billing Gemini hoặc giảm tần suất worker |
| Brevo hết quota ngày | Log lỗi SMTP, user không nhận mail | Nâng gói Brevo |
| Cron worker chạy mỗi 30s | CPU backend cao liên tục | Giãn `cron.schedule` trong `cronWorker.js:187` lên 2–5 phút |
| Atlas M0 hết connection | Lỗi `connection pool` | Nâng lên M10 |
| Email vào Spam | mail-tester < 7 điểm | Kiểm tra lại DKIM/SPF/DMARC, tăng warm-up dần |

### 5.4 Quy trình release về sau

1. Làm việc trên nhánh feature → PR về `main`.
2. Railway Pro hỗ trợ **PR Environment** — bật để mỗi PR có bản preview riêng.
3. Merge vào `main` → Railway tự deploy service tương ứng (theo Watch Paths).
4. Nếu lỗi: Railway → Deployments → **Rollback** về bản trước (tức thì, không cần build lại).

---

## Phụ lục — Ước lượng chi phí hằng tháng

| Hạng mục | Ước tính |
|---|---|
| Railway Pro | $20 seat + usage (3 service nhỏ ≈ $15–40) |
| MongoDB Atlas M10 | ≈ $57 (hoặc M0 free khi còn thử nghiệm) |
| Cloudflare R2 | $0.015/GB lưu trữ, **miễn phí egress** — CV vài GB ≈ dưới $1 |
| Brevo | Free 300 mail/ngày · Starter từ ~$9 |
| Gemini / Groq | Free tier, trả phí theo lượng dùng |
| Domain | ~$10–15/năm |
| Cloudflare DNS | Free |

---

## Tóm tắt việc cần làm

**Phase 0 — code (đã xong, chỉ cần commit & push)**

- [x] Tách `frontendOrigin()` ra `backend/src/utils/frontendUrl.js`, thay 5 chỗ đọc env trực tiếp
- [x] `ai/railway.json` — start command bind `::`
- [x] `backend/nixpacks.toml` — GraphicsMagick + Ghostscript cho OCR
- [x] `backend/railway.json`, `frontend/railway.json` — builder, healthcheck, restart policy
- [x] `engines` cho backend/frontend · `ai/.python-version`
- [x] Sentry sample rate theo môi trường (4 file)
- [x] Diễn giải lỗi OCR thiếu binary trong `cronWorker.js`

**Phase 1 — tài khoản dịch vụ (làm tay, cần key trước khi sang Phase 2)**

- [ ] Atlas: cluster + DB user quyền hẹp + allowlist `0.0.0.0/0` + bật backup
- [ ] R2: bucket private `smart-recruit-cvs` + API token Object Read & Write
- [ ] Brevo: add domain, lấy bộ bản ghi DNS, lấy SMTP login + key
- [ ] Gemini key · Groq key
- [ ] *(tuỳ chọn)* Google/Facebook OAuth app

**Phase 2 — Railway**

- [ ] Tạo project + 3 service từ cùng repo
- [ ] Mỗi service: đặt **Root Directory** và **Watch Paths** (2 mục duy nhất phải làm tay)
- [ ] Nhập biến môi trường theo bảng 2.2
- [ ] Deploy theo thứ tự `ai` → `backend` → `frontend`
- [ ] Verify private network: `curl http://ai.railway.internal:8000/health` từ shell backend

**Phase 3 — domain**

- [ ] Trỏ nameserver `cvoneclickmatch.com` về Cloudflare
- [ ] Thêm custom domain trên Railway, lấy CNAME target
- [ ] Tạo CNAME (`@`, `www`, `api`) ở chế độ **DNS only** + TXT của Brevo
- [ ] Chờ TLS Active → bấm Verify trong Brevo → *(tuỳ chọn)* bật proxy với Full (strict)
- [ ] Redirect rule `www` → apex
- [ ] Cập nhật OAuth redirect URI sang `https://api.cvoneclickmatch.com/...`

**Phase 4 — dữ liệu & kiểm thử**

- [ ] Tạo admin: đăng ký thường rồi sửa `role` trong Atlas (**không chạy `run_seed.js`**)
- [ ] Chạy 11 bước kiểm thử end-to-end
- [ ] Test deliverability email trên mail-tester (mục tiêu ≥ 8/10)

**Phase 5 — vận hành**

- [ ] Bật Atlas backup + R2 Object Versioning
- [ ] Đặt `SENTRY_DSN` cho backend
- [ ] Uptime monitor ping `/health` mỗi 5 phút
- [ ] Bật deployment notification về Slack/Discord
