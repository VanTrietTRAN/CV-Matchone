# Smart Recruit

Nền tảng tuyển dụng ứng dụng AI: chấm điểm độ phù hợp giữa CV ứng viên và tin tuyển dụng
bằng vector embedding, giúp ứng viên biết mình khớp bao nhiêu % trước khi ứng tuyển và giúp
nhà tuyển dụng xếp hạng hồ sơ tự động.

## Kiến trúc

| Service | Công nghệ | Cổng mặc định | Vai trò |
|---|---|---|---|
| `frontend/` | Next.js 16 · React 19 · Tailwind v4 | `3000` | Giao diện ứng viên / nhà tuyển dụng / admin |
| `backend/` | Node.js · Express 5 · MongoDB (Mongoose) | `5000` | REST API, xác thực, upload CV, email, cron |
| `ai/` | Python · FastAPI · Gemini Embedding | `8000` | Tạo embedding & tính cosine similarity |

Luồng chính: `frontend` → `backend` → `ai` → MongoDB Atlas.
Nếu không chạy `ai`, hệ thống vẫn hoạt động nhưng **điểm phù hợp luôn bằng 0**.

## Yêu cầu hệ thống

- **Node.js ≥ 20.9** (khuyến nghị 22 LTS) và npm ≥ 10
- **Python ≥ 3.11** (đã kiểm thử trên 3.13)
- **MongoDB Atlas** (hoặc MongoDB local) — cần connection string
- **Gemini API key** — https://aistudio.google.com/app/apikey (bắt buộc để có điểm phù hợp)
- *(tuỳ chọn)* **GraphicsMagick + Ghostscript** — chỉ cần khi muốn OCR các CV dạng ảnh scan.
  Không cài thì CV PDF có text vẫn bóc tách bình thường.

## Cài đặt

### 1. Clone và cài dependency

```bash
git clone <repo-url>
cd Smart-Recruit

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# AI service (dùng virtualenv riêng)
cd ai
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 2. Tạo file môi trường

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
cp ai/.env.example ai/.env
```

Tối thiểu cần điền để chạy được:

| File | Biến | Ghi chú |
|---|---|---|
| `backend/.env` | `MONGO_URI` | Connection string MongoDB, nhớ kèm tên database `/smart_recruit` |
| `backend/.env` | `JWT_SECRET` | Sinh bằng `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `backend/.env` | `AI_SERVICE_URL` | `http://localhost:8000` |
| `ai/.env` | `GEMINI_API_KEY` | Lấy tại Google AI Studio |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:5000` |

Các nhóm còn lại (`GROQ_API_KEY` để bóc tách CV, SMTP Brevo để gửi email, OAuth Google/Facebook,
Cloudflare R2 để lưu file CV, Sentry) là **tuỳ chọn** — bỏ trống thì tính năng tương ứng tự tắt.
Xem chú thích chi tiết trong từng file `.env.example`.

### 3. Nạp dữ liệu mẫu (tuỳ chọn)

```bash
cd backend && node run_seed.js
```

> ⚠️ Script này **xoá toàn bộ database** trước khi tạo lại dữ liệu mẫu. Chỉ chạy trên DB phát triển.

Tài khoản mẫu — mật khẩu chung `123123`:

- Nhà tuyển dụng: `hr@techlogistics.vn`, `tuyendung@iot-smart.io`, `career@fintech-asia.com`, …
- Ứng viên: `khai13@gmail.com`, `nhi15@gmail.com`

Tài khoản **admin** không được tạo qua form đăng ký (API chặn `role=admin`). Muốn có admin,
sửa trực tiếp trường `role` của user thành `"admin"` trong MongoDB.

### 4. Chạy 3 service (3 terminal riêng)

```bash
# Terminal 1 — AI service
cd ai
# kích hoạt venv như bước 1
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Backend
cd backend
npm run dev

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Mở http://localhost:3000

## Kiểm tra nhanh

```bash
curl http://localhost:8000/health   # AI: status ok + gemini_key_configured true
curl http://localhost:5000/health   # Backend: status ok + database connected
```

## Lệnh thường dùng

| Thư mục | Lệnh | Mô tả |
|---|---|---|
| `frontend` | `npm run dev` / `npm run build` / `npm start` | Dev · build production · chạy bản build |
| `backend` | `npm run dev` / `npm start` | Dev (nodemon) · production |
| `backend` | `node run_seed.js` | Nạp lại dữ liệu mẫu (xoá DB cũ) |
| `backend` | `node src/scripts/smokeTest.js` | Kiểm thử nhanh các endpoint chính |
| `backend` | `node src/scripts/dbBackup.js` | Xuất backup database ra `backend/backups/` |
| `backend` | `node src/scripts/migrateJobMeta.js` | Dọn metadata bị nối vào cuối mô tả tin cũ, đổ về đúng cột. Bỏ `--apply` để xem trước, chạy lại nhiều lần không sao |
| `ai` | `uvicorn app.main:app --reload --port 8000` | Chạy AI service |

## Cấu trúc thư mục

```
Smart-Recruit/
├── frontend/          # Next.js App Router — xem ROUTES.md & DESIGN-SYSTEM.md
│   ├── app/           # Route + globals.css (design token)
│   ├── components/    # Component dùng chung + shadcn/ui
│   ├── layouts/       # PublicLayout · Candidate · Employer · Admin
│   └── lib/           # api client, format, auth-storage
├── backend/
│   ├── src/routes/        # auth · users · cv · jobs · applications · notifications · admin
│   ├── src/controllers/   # Xử lý nghiệp vụ
│   ├── src/models/        # Schema Mongoose
│   ├── src/services/      # aiService · emailService · cvExtractor · storageService · cronWorker
│   └── run_seed.js        # Dữ liệu mẫu
├── ai/
│   ├── app/main.py            # FastAPI: /get-embedding · /calculate-matching · /health
│   └── app/services/          # embedding_service · matching_service
└── Data/database/     # Bản dump JSON tham khảo (nằm trong .gitignore, không có sau khi clone)
```

## Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| Điểm phù hợp luôn `0` hoặc "Chưa chấm" | AI service chưa chạy, hoặc `AI_SERVICE_URL` / `GEMINI_API_KEY` chưa đặt. Kiểm tra `curl :8000/health` |
| Trình duyệt báo lỗi CORS | `CLIENT_ORIGIN` trong `backend/.env` phải khớp đúng origin frontend (mặc định `http://localhost:3000`) |
| Đăng nhập xong bị đá về `/login` | Cookie phiên không được gửi kèm — kiểm tra `CLIENT_ORIGIN` và `NEXT_PUBLIC_API_URL` cùng scheme/host |
| Backend log `WARNING: ... RESEND_API_KEY is set` | Chưa cấu hình SMTP. Email sẽ không gửi được nhưng các chức năng khác vẫn chạy |
| CV upload không bóc tách được nội dung | CV là ảnh scan → cần cài GraphicsMagick + Ghostscript cho bước OCR |
| `429` khi tạo embedding | Gemini free tier bị rate limit — chờ rồi thử lại, hoặc nâng hạn mức API |

## Tài liệu thêm

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — kế hoạch deploy lên Railway + Cloudflare + Brevo
- [`frontend/ROUTES.md`](frontend/ROUTES.md) — danh sách route và cấu trúc layout
- [`frontend/DESIGN-SYSTEM.md`](frontend/DESIGN-SYSTEM.md) — design token, component dùng chung
