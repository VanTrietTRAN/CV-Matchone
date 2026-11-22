const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Ghi mốc "còn hoạt động" — thư gợi ý (làn P2) chỉ gửi cho người dùng có mốc này
 * trong 14–30 ngày gần nhất. Cookie đăng nhập sống 7 ngày nên chỉ ghi lúc login
 * là không đủ; ghi ở đây, nhưng tối đa mỗi giờ một lần và không chờ kết quả.
 */
const ACTIVE_TOUCH_MS = 60 * 60 * 1000;
const touchLastActive = (user) => {
    const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    if (Date.now() - last < ACTIVE_TOUCH_MS) return;
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
};

const protect = async (req, res, next) => {
    let token;

    // 1. Ưu tiên đọc từ HTTPOnly Cookie (bảo mật hơn)
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    // 2. Fallback: đọc từ Authorization header (tương thích ngược với Postman / mobile)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Không có quyền truy cập, thiếu token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            return res.status(401).json({ message: 'Tài khoản không tồn tại' });
        }

        touchLastActive(req.user);
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Không đủ quyền truy cập, token không hợp lệ' });
    }
};

/**
 * Nhận diện người dùng nếu có token, nhưng KHÔNG chặn khi không có.
 *
 * Dùng cho các endpoint công khai cần biết "ai đang xem" mà vẫn phải phục vụ
 * khách vãng lai — ví dụ đếm lượt xem tin tuyển dụng: token hỏng hay hết hạn
 * thì coi như khách, không trả 401 làm hỏng trang đang mở.
 */
const optionalAuth = async (req, res, next) => {
    let token;
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (user) req.user = user;
    } catch {
        // Token hỏng/hết hạn: cứ coi như khách vãng lai
    }
    return next();
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Quyền truy cập của bạn (${req.user.role}) không được phép thực hiện hành động này`
            });
        }
        next();
    };
};

module.exports = { protect, optionalAuth, authorize, touchLastActive };