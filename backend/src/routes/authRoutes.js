const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    register,
    login,
    logout,
    getCurrentUser,
    googleAuth,
    googleCallback,
    facebookAuth,
    facebookCallback,
    forgotPassword,
    resetPassword,
    changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 password reset requests per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.' },
});

// Limiter riêng cho đổi mật khẩu — KHÔNG dùng chung passwordResetLimiter.
// Hai lý do: (1) thông báo của limiter kia nói về "đặt lại mật khẩu", sai ngữ
// cảnh khi người dùng chỉ gõ nhầm mật khẩu hiện tại; (2) dùng chung nghĩa là
// gõ nhầm vài lần sẽ khoá luôn cả chức năng quên mật khẩu.
// Vẫn cần giới hạn vì endpoint này cho phép thử mật khẩu hiện tại.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Bạn đã thử đổi mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.' },
});

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);
router.get('/me', protect, getCurrentUser);
router.put('/change-password', changePasswordLimiter, protect, changePassword);

router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);
router.get('/facebook', facebookAuth);
router.get('/facebook/callback', facebookCallback);

module.exports = router;