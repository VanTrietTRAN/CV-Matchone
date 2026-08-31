require("dotenv").config(); // Load biến môi trường
const Sentry = require("@sentry/node");

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Production lấy mẫu 10% để không đốt quota Sentry; dev giữ 100% cho dễ debug.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  console.log('[Sentry] Khởi tạo giám sát lỗi Backend thành công.');
}

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const connectDB = require("./src/config/db");

const app = express();
// Trust Reverse Proxy (Render/Railway/Cloudflare) to read real client IP from X-Forwarded-For
// Without this, express-rate-limit sees all requests coming from the Proxy IP -> rate limits all users unintentionally
app.set('trust proxy', 1);

const path = require("path");
const fs = require("fs");

connectDB();

// ─── Rate Limiters ───────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 requests / 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again after 15 minutes.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // max 10 uploads / hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many uploads, please try again later.' },
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allowlist: hỗ trợ nhiều origin cách nhau bởi dấu phẩy qua biến môi trường
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép request không có origin (ví dụ: curl, Postman) trong dev
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: origin '${origin}' không được phép.`));
      }
    },
    credentials: true, // Cho phép gửi cookie kèm request
  }),
);

// Giới hạn mặc định của express.json là 100kb. CV có ảnh chân dung gửi kèm ảnh
// dạng data URL nên dễ vượt mức đó — nâng lên 2mb, vẫn đủ chặt để không thành
// chỗ cho người ta nhồi dữ liệu lớn.
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser()); // Đọc HTTPOnly cookie từ request

const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP header to allow Next.js cross-origin assets if needed
}));

// KHÔNG phục vụ thư mục uploads ra public — CV phải qua signed URL (Ngày 4)
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Health Check ─────────────────────────────────────────────────────────────
// Railway và uptime monitor gọi endpoint này để kiểm tra service có sống không
app.get("/health", async (req, res) => {
  const mongoose = require("mongoose");
  const dbState = mongoose.connection.readyState;
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  const isHealthy = dbState === 1;

  // Không gọi AI ở healthcheck mặc định vì Railway ping liên tục.
  // Thêm ?ai=1 khi cần biết backend có với tới AI service không — cấu hình sai
  // (ví dụ AI_SERVICE_URL = "http://:8000") khiến mọi điểm phù hợp bằng 0 mà
  // không báo lỗi ở bất kỳ đâu.
  let ai;
  if (req.query.ai) {
    const { checkAiHealth } = require("./src/services/aiService");
    ai = await checkAiHealth();
  } else {
    const { getAiConfig } = require("./src/services/aiService");
    const cfg = getAiConfig();
    ai = { configured: cfg.configured, ...(cfg.error ? { error: cfg.error } : {}) };
  }

  // Kho lưu trữ file CV: thiếu biến R2_* thì import CV vẫn chạy nhưng file nằm
  // trong MongoDB — cần nhìn thấy được để không tưởng là đang dùng R2.
  const { getStorageConfig } = require("./src/services/storageService");

  // Cấu hình gửi mail. ?email=1 bắt tay thật với SMTP (mất ~1-2 giây) nên không
  // chạy ở healthcheck mặc định mà Railway ping liên tục.
  const emailService = require("./src/services/emailService");
  const email = req.query.email
    ? { ...emailService.getEmailConfig(), ...(await emailService.verifyEmailConnection()) }
    : emailService.getEmailConfig();

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: dbStatus,
    ai,
    storage: getStorageConfig(),
    email,
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

app.get("/", (req, res) => {
  res.send("API Smart Recruit đang chạy và đã kết nối DB!");
});

// Áp dụng rate limit cho các route xác thực nhạy cảm
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/users", require("./src/routes/userRoutes"));

app.use("/api/cv/upload", uploadLimiter);
app.use("/api/cv", require("./src/routes/cvRoutes"));
app.use("/api/jobs", require("./src/routes/jobRoutes"));
app.use("/api/applications", require("./src/routes/applicationRoutes"));
app.use("/api/notifications", require("./src/routes/notificationRoutes"));
app.use("/api/job-alerts", require("./src/routes/jobAlertRoutes"));
app.use("/api/reviews", require("./src/routes/reviewRoutes"));
app.use("/api/admin", require("./src/routes/adminRoutes"));

// Debug Sentry endpoint to test error capturing (only in non-production)
if (process.env.NODE_ENV !== 'production') {
  app.get("/debug-sentry", (req, res) => {
    throw new Error("Sentry Debug Backend Error: Kiểm tra giám sát lỗi hoạt động tốt!");
  });
}

// Sentry error handler must be registered before other error handlers and after all controllers
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ─── Error Handler ────────────────────────────────────────────────────────────
// Trước đây app không có error handler nào. Lỗi từ multer (file quá 5MB, không
// phải PDF) rơi xuống handler mặc định của Express và trả về HTML. Frontend gọi
// res.json() trên HTML đó nên báo "Unexpected token '<'" — người dùng chỉ thấy
// import CV hỏng mà không biết file của mình sai ở đâu.
const multer = require("multer");
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "File vượt quá giới hạn 5MB. Vui lòng chọn file nhỏ hơn.",
      LIMIT_UNEXPECTED_FILE: "Tên trường file không đúng, hệ thống mong đợi trường 'cv'.",
    };
    return res.status(400).json({ message: messages[err.code] || `Lỗi tải file: ${err.message}` });
  }

  // fileFilter của uploadMiddleware ném Error thường khi file không phải PDF
  if (/PDF/i.test(err.message || "")) {
    return res.status(400).json({ message: err.message });
  }

  if (/^CORS blocked/.test(err.message || "")) {
    return res.status(403).json({ message: err.message });
  }

  console.error("[Express] Lỗi chưa được xử lý:", err);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === "production" ? "Lỗi hệ thống." : err.message,
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);

  const { startCronJobs } = require("./src/cronJob");
  startCronJobs();

  // Khởi chạy background AI worker xử lý CV
  const { initCronWorker } = require("./src/services/cronWorker");
  initCronWorker();
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
// Railway gửi SIGTERM trước khi dừng container; cho phép các request đang chạy hoàn thành
const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] Bắt đầu dừng server...`);
  server.close(async () => {
    console.log('HTTP server đã dừng nhận request mới.');
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      console.log('Kết nối MongoDB đã đóng.');
    } catch (err) {
      console.error('Lỗi khi đóng MongoDB:', err.message);
    }
    process.exit(0);
  });

  // Bẫt buộc dừng sau 15 giây nếu server chưa thoát
  setTimeout(() => {
    console.error('Timeout graceful shutdown, buộc dừng.');
    process.exit(1);
  }, 15000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Railway
process.on('SIGINT', () => gracefulShutdown('SIGINT'));  // Ctrl+C local
