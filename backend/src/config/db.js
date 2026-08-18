const mongoose = require('mongoose');
const dns = require('dns');

// Fix lỗi querySrv ECONNREFUSED trên một số mạng ISP/VPN tại Việt Nam
// Ưu tiên IPv4 cho DNS lookup thay vì IPv6
dns.setDefaultResultOrder('ipv4first');

const MAX_CONNECT_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 3000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cluster chia sẻ của Atlas (M0/M2/M5) thỉnh thoảng bầu lại primary hoặc bảo trì,
// làm kết nối rớt vài giây. Driver tự kết nối lại, nhưng nếu không lắng nghe sự
// kiện thì việc đó diễn ra âm thầm — log không có gì, chỉ thấy request lỗi lác đác.
let eventsRegistered = false;
const registerConnectionEvents = () => {
    if (eventsRegistered) return;
    eventsRegistered = true;

    const conn = mongoose.connection;

    conn.on('disconnected', () => {
        console.warn('[MongoDB] Mất kết nối. Driver đang tự thử kết nối lại...');
    });

    conn.on('reconnected', () => {
        console.log('[MongoDB] Đã kết nối lại thành công.');
    });

    // Lỗi sau khi đã kết nối: KHÔNG thoát process. Driver còn đang thử lại, và
    // thoát ở đây sẽ khiến Railway restart container — mất luôn cron đang chạy
    // và mọi kết nối đang phục vụ, chỉ vì một sự cố vài giây bên phía Atlas.
    conn.on('error', (err) => {
        console.error(`[MongoDB] Lỗi kết nối: ${err.message}`);
    });
};

const connectDB = async () => {
    registerConnectionEvents();

    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
        try {
            const conn = await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 10000, // Timeout sau 10s nếu không chọn được server

                // KHÔNG đặt socketTimeoutMS. Giá trị cũ 45s đóng cả socket đang rảnh
                // lẫn thao tác chạy lâu (aggregate, tạo index), gây rớt kết nối định kỳ
                // trông như "Atlas tự ngắt". Mặc định của driver là không giới hạn.

                family: 4, // Dùng IPv4, tránh lỗi với IPv6 trên một số mạng

                maxPoolSize: 10,        // Đủ cho 1 instance; tránh đốt hạn mức kết nối của Atlas
                minPoolSize: 1,         // Giữ 1 kết nối ấm, không phải bắt tay lại từ đầu
                maxIdleTimeMS: 60000,   // Trả kết nối rảnh về sau 60s, do Atlas tự đóng
                retryWrites: true,
                retryReads: true,       // Thử lại lệnh đọc khi primary vừa đổi
            });

            console.log(`MongoDB Connected: ${conn.connection.host}`);
            return conn;
        } catch (error) {
            const isLastAttempt = attempt === MAX_CONNECT_ATTEMPTS;
            console.error(
                `[MongoDB] Kết nối thất bại (lần ${attempt}/${MAX_CONNECT_ATTEMPTS}): ${error.message}`,
            );

            if (isLastAttempt) {
                console.error('[MongoDB] Đã thử hết số lần cho phép. Dừng tiến trình.');
                process.exit(1);
            }

            // Backoff tăng dần: 3s, 6s, 9s, 12s
            const delay = RETRY_BASE_DELAY_MS * attempt;
            console.log(`[MongoDB] Thử lại sau ${delay / 1000}s...`);
            await wait(delay);
        }
    }
};

module.exports = connectDB;
