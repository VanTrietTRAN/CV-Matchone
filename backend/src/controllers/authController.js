const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { frontendOrigin } = require('../utils/frontendUrl');
const { touchLastActive } = require('../middleware/authMiddleware');

// ─── Helper: tạo token và gắn vào HTTPOnly Cookie ─────────────────────────────
// Thuộc tính cookie phiên đăng nhập, dùng chung cho cả lúc SET và lúc XOÁ.
// res.clearCookie chỉ xoá được khi thuộc tính khớp y hệt lúc set — để hai nơi
// tự khai riêng thì chỉ cần lệch một cờ là đăng xuất không xoá được cookie.
//
// Frontend và backend nằm ở hai origin khác nhau nên cookie là cross-site:
// bắt buộc SameSite=None + Secure.
//
// VẤN ĐỀ với hai domain *.up.railway.app: 'up.railway.app' nằm trong Public
// Suffix List, nên trình duyệt coi frontend và backend là hai SITE khác nhau
// -> cookie thành cookie BÊN THỨ BA. Trình duyệt chặn cookie bên thứ ba (Brave
// và Safari mặc định, Chrome khi bật hạn chế, mọi cửa sổ ẩn danh) vẫn cho đăng
// nhập thành công nhưng KHÔNG gửi cookie kèm request kế tiếp -> request đó trả
// 401 -> frontend dọn localStorage rồi đá về /login. Triệu chứng đúng như báo
// cáo: "đăng nhập xong bị văng ra ngay", và khác nhau tuỳ máy/trình duyệt.
//
// COOKIE_PARTITIONED=true bật thuộc tính Partitioned (CHIPS) để Chrome/Edge
// chấp nhận cookie kể cả khi đã hạn chế cookie bên thứ ba.
//
// Cách sửa triệt để: đưa frontend và backend về cùng một registrable domain
// (cvoneclickmatch.com + api.cvoneclickmatch.com). Khi đó cookie thành same-site
// và KHÔNG cần COOKIE_PARTITIONED nữa — nhớ gỡ cờ này đi.
const buildCookieOptions = () => {
    const isProduction = process.env.NODE_ENV === 'production';

    const options = {
        httpOnly: true,                          // Không cho JS client đọc
        secure: isProduction,                    // Chỉ HTTPS ở production
        sameSite: isProduction ? 'none' : 'lax', // Cross-site cookie khi production
        path: '/',
    };

    if (isProduction && process.env.COOKIE_PARTITIONED === 'true') {
        options.partitioned = true;
    }

    // Nếu có COOKIE_DOMAIN (ví dụ: .domain.vn) thì gán để chia sẻ cross-subdomain
    if (process.env.COOKIE_DOMAIN) {
        options.domain = process.env.COOKIE_DOMAIN;
    }

    return options;
};

/** Cấp cookie phiên — dùng chung cho đăng nhập mật khẩu và OAuth (cùng thuộc tính để logout xoá được). */
const setAuthCookie = (user, res) => {
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '7d',
    });

    res.cookie('token', token, {
        ...buildCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });
    // Mốc hoạt động — điều kiện nhận thư gợi ý (làn P2)
    touchLastActive(user);
};

const sendTokenCookie = (user, statusCode, res, extraJson = {}) => {
    setAuthCookie(user, res);

    return res.status(statusCode).json({
        _id: user._id,
        email: user.email,
        role: user.role,
        // Tài khoản do admin import có mật khẩu tạm gửi qua email; client thấy cờ
        // này thì đưa thẳng người dùng sang trang đổi mật khẩu.
        ...(user.mustChangePassword === true ? { mustChangePassword: true } : {}),
        // Không trả token trong body — client dùng cookie
        ...extraJson,
    });
};

// ─── Kiểm tra đầu vào dùng chung ──────────────────────────────────────────────
// Express 5 đọc JSON nên `email` có thể là object: { "$regex": "^admin" } đi
// thẳng vào User.findOne là đăng nhập được vào tài khoản người khác. Mọi trường
// định danh/mật khẩu PHẢI là chuỗi trước khi chạm tới database hay bcrypt.
const isStr = (v) => typeof v === 'string';
const normEmail = (v) => v.trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tài khoản bị khoá hoặc đã xoá mềm không được đăng nhập bằng bất kỳ đường nào. */
const isBlocked = (user) => user.status === 'banned' || user.isDeleted === true;
const BLOCKED_MESSAGE = 'Tài khoản đã bị khoá hoặc không còn hoạt động. Liên hệ quản trị viên nếu cần hỗ trợ.';

/** GET /api/auth/captcha — mã xác nhận cho form đăng ký doanh nghiệp (xem utils/captcha.js). */
const getCaptcha = (req, res) => {
    const { issue } = require('../utils/captcha');
    res.set('Cache-Control', 'no-store');
    res.json(issue());
};

// ─── Register ─────────────────────────────────────────────────────────────────
const register = async (req, res) => {
    const body = req.body || {};
    const { password, role } = body;

    try {
        if (!isStr(body.email) || !isStr(password) || !body.email.trim() || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
        }
        const email = normEmail(body.email);
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: 'Email không hợp lệ' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu cần ít nhất 6 ký tự' });
        }

        // ✅ P0: Chặn public register tạo tài khoản admin
        const allowedRoles = ['candidate', 'employer'];
        if (!role || !allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Vai trò không hợp lệ (chỉ candidate hoặc employer)' });
        }

        // Mã xác nhận kiểm tra ở SERVER — trước đây chỉ so trên trình duyệt nên
        // gọi thẳng API là đăng ký được hàng loạt tài khoản doanh nghiệp.
        if (role === 'employer') {
            const captcha = require('../utils/captcha');
            if (!captcha.verify(body.captchaToken, body.captcha)) {
                return res.status(400).json({
                    message: 'Mã xác nhận chưa đúng hoặc đã hết hạn. Vui lòng nhập lại mã mới.',
                    captchaInvalid: true,
                });
            }
        }

        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'Email đã tồn tại' });

        // Hồ sơ công ty kiểm tra TRƯỚC khi tạo tài khoản: trước đây User tạo
        // xong rồi CompanyProfile mới báo lỗi enum, để lại một User mồ côi không
        // có emailVerified — đăng nhập thẳng được mà không cần xác thực email.
        const CompanyProfile = require('../models/CompanyProfile');
        const str = (v, fallback = '') => (isStr(v) ? v : fallback);
        const profileData =
            role === 'employer'
                ? {
                      companyName: str(body.companyName),
                      industry: str(body.industry, 'other') || 'other',
                      size: str(body.size, 'startup') || 'startup',
                      country: str(body.country, 'Việt Nam') || 'Việt Nam',
                      province: str(body.province),
                      address: str(body.address),
                      about: str(body.about),
                      contactName: str(body.contactName),
                      phone: str(body.phone),
                      taxId: str(body.taxId),
                  }
                : null;
        if (profileData) {
            const mongoose = require('mongoose');
            await new CompanyProfile({ userId: new mongoose.Types.ObjectId(), ...profileData }).validate();
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Không đăng nhập ngay: gửi mã 6 số và bắt xác thực email trước.
        // emailVerified=false ghi NGAY lúc tạo, không để một bước sau mới ghi.
        const otp = require('../utils/otp');
        const { code, hash, expiresAt } = otp.issueCode();
        const user = await User.create({
            email,
            password: hashedPassword,
            role,
            emailVerified: false,
            verificationCode: hash,
            verificationCodeExpire: expiresAt,
            verificationAttempts: 0,
        });

        if (profileData) {
            try {
                await CompanyProfile.create({ userId: user._id, ...profileData });
            } catch (e) {
                // Không để lại tài khoản thiếu hồ sơ công ty
                await User.deleteOne({ _id: user._id });
                throw e;
            }
        }

        const emailService = require('../services/emailService');
        const result = await emailService.sendVerificationEmail({
            to: user.email,
            fullName: user.email.split('@')[0],
            code,
            minutes: Math.round(otp.TTL_MS / 60000),
        }).catch((e) => ({ sent: false, error: e.message }));

        return res.status(201).json({
            message: 'Đã tạo tài khoản. Vui lòng kiểm tra email để lấy mã xác thực.',
            data: {
                email: user.email,
                role: user.role,
                needsVerification: true,
                // Báo thật khi gửi hỏng để người dùng biết đường bấm gửi lại,
                // thay vì ngồi chờ một email không bao giờ tới.
                emailSent: result?.sent !== false,
            },
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const msgs = Object.values(error.errors || {}).map((e) => e.message);
            return res.status(400).json({ message: msgs.join(' ') || error.message });
        }
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Email đã tồn tại' });
        }
        res.status(500).json({ message: error.message });
    }
};

// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
    const { email, password, role } = req.body || {};
    const WRONG = 'Email hoặc mật khẩu không chính xác';

    try {
        // Chỉ nhận chuỗi: { "$regex": "..." } ở đây là đăng nhập không cần mật khẩu
        if (!isStr(email) || !isStr(password) || !email.trim() || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu.' });
        }

        const user = await User.findOne({ email: normEmail(email) });

        // 1. Không có tài khoản, hoặc tài khoản chỉ đăng nhập bằng Google/Facebook
        //    (không có mật khẩu) — trả cùng một câu để không lộ loại tài khoản.
        if (!user || !user.password) {
            return res.status(401).json({ message: WRONG });
        }

        // 2. Validate role BEFORE password comparison (prevent timing attacks and CPU load on mismatched portals)
        if (user.role !== 'admin' && role && user.role !== role) {
            return res.status(401).json({ message: WRONG });
        }

        // 3. Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: WRONG });
        }

        // 3b. Đúng mật khẩu nhưng tài khoản đã xoá mềm → coi như không tồn tại;
        //     bị khoá → báo rõ để người dùng biết liên hệ quản trị.
        if (user.isDeleted === true) {
            return res.status(401).json({ message: WRONG });
        }
        if (user.status === 'banned') {
            return res.status(403).json({ message: BLOCKED_MESSAGE, banned: true });
        }

        // 4. Chặn tài khoản chưa xác thực email.
        // Chỉ chặn khi === false. Tài khoản tạo trước tính năng này không có
        // trường emailVerified (undefined) nên vẫn đăng nhập bình thường —
        // thêm tính năng không được phép khoá người dùng đang có.
        if (user.emailVerified === false) {
            return res.status(403).json({
                message: 'Tài khoản chưa xác thực email. Vui lòng nhập mã đã gửi tới hộp thư của bạn.',
                needsVerification: true,
                email: user.email,
            });
        }

        return sendTokenCookie(user, 200, res);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = (req, res) => {
    // Phải dùng đúng bộ thuộc tính đã set, nếu không trình duyệt bỏ qua lệnh xoá
    res.clearCookie('token', buildCookieOptions());
    res.status(200).json({ message: 'Đăng xuất thành công' });
};

// ─── Get Current User ─────────────────────────────────────────────────────────
const getCurrentUser = async (req, res) => {
    res.json({
        _id: req.user._id,
        email: req.user.email,
        role: req.user.role,
        isEmailSubscribed: req.user.isEmailSubscribed,
        mustChangePassword: req.user.mustChangePassword === true,
        status: req.user.status
    });
};

// ─── OAuth (Google, Facebook) ─────────────────────────────────────────────────
//
// Ba lỗ hổng đã vá:
//   1. Không có tham số `state` → kẻ tấn công gài mã OAuth của mình vào trình
//      duyệt nạn nhân (login CSRF). Nay sinh `state` ngẫu nhiên, lưu cookie
//      HTTPOnly 10 phút và đối chiếu ở callback.
//   2. redirect_uri dựng từ header Host → giả Host là dắt mã OAuth sang tên miền
//      khác. Nay lấy từ API_PUBLIC_URL cố định (production bắt buộc phải đặt).
//   3. Tự liên kết theo email kể cả khi nhà cung cấp chưa xác minh email đó, và
//      liên kết được cả vào tài khoản admin. Nay chỉ liên kết khi email đã xác
//      minh, không bao giờ liên kết tự động vào tài khoản admin.
const crypto = require('crypto');
const OAUTH_STATE_COOKIE = 'oauth_state';

const oauthCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Callback là điều hướng cấp cao nhất từ Google/Facebook về → Lax là đủ
    sameSite: 'lax',
    path: '/api/auth',
});

/** Gốc URL public của backend để dựng redirect_uri. Production KHÔNG đọc Host header. */
const backendOrigin = () => {
    const fixed = String(process.env.API_PUBLIC_URL || process.env.BACKEND_URL || '')
        .trim()
        .replace(/\/+$/, '');
    if (fixed) return fixed;
    if (process.env.NODE_ENV === 'production') return null;
    return `http://localhost:${process.env.PORT || 5000}`;
};

const issueOAuthState = (res) => {
    const state = crypto.randomBytes(24).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, state, { ...oauthCookieOptions(), maxAge: 10 * 60 * 1000 });
    return state;
};

const consumeOAuthState = (req, res) => {
    const expected = req.cookies?.[OAUTH_STATE_COOKIE];
    const given = req.query?.state;
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieOptions());
    if (!isStr(expected) || !isStr(given) || expected.length !== given.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
};

/**
 * Tìm hoặc tạo tài khoản cho danh tính OAuth.
 * @returns {{user?: object, error?: string}} error là mã lỗi đưa lên /login?error=
 */
const resolveOAuthUser = async ({ idField, providerId, email, emailVerified }) => {
    let user = await User.findOne({ [idField]: providerId });
    if (!user && email) {
        const byEmail = await User.findOne({ email });
        if (byEmail) {
            // Email chưa được nhà cung cấp xác minh thì không chứng minh được ai
            // sở hữu hộp thư — liên kết là trao tài khoản cho người lạ.
            if (!emailVerified) return { error: 'email_unverified' };
            // Admin chỉ đăng nhập bằng mật khẩu; không tự gắn danh tính mạng xã hội
            if (byEmail.role === 'admin') return { error: 'oauth_admin_link' };
            byEmail[idField] = providerId;
            await byEmail.save();
            user = byEmail;
        }
    }
    if (!user) {
        if (!email || !emailVerified) return { error: 'email_unverified' };
        user = await User.create({
            email,
            [idField]: providerId,
            role: 'candidate',
            // Nhà cung cấp đã xác minh email nên không bắt nhập mã nữa
            emailVerified: true,
        });
    }
    if (isBlocked(user)) return { error: 'account_locked' };
    return { user };
};

const finishOAuthLogin = async ({ user, name, providerLabel, res }) => {
    if (user.role === 'candidate') {
        const CvProfile = require('../models/CvProfile');
        const cv = await CvProfile.findOne({ userId: user._id }).select('_id').lean();
        if (!cv) {
            await CvProfile.create({
                userId: user._id,
                fullName: name,
                email: user.email,
                summary: `Hồ sơ được tạo tự động từ liên kết ${providerLabel}.`,
                skills: [],
                embedding: [],
                isLookingForJob: true,
            });
        }
    }

    // ✅ P0: Gắn token qua cookie, KHÔNG đặt token trên URL
    setAuthCookie(user, res);

    const redirectTarget =
        user.role === 'employer' ? '/employer/dashboard' : user.role === 'admin' ? '/admin/dashboard' : '/candidate/dashboard';
    res.redirect(`${frontendOrigin()}${redirectTarget}?oauth=success`);
};

const googleAuth = (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const origin = backendOrigin();
    if (!origin) {
        return res.status(503).json({ message: 'Chưa cấu hình API_PUBLIC_URL nên không đăng nhập Google được.' });
    }
    const state = issueOAuthState(res);

    if (!clientId || !clientSecret) {
        // ✅ P0: Tắt mock OAuth khi chạy production
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ message: 'Google OAuth chưa được cấu hình trên server này.' });
        }
        console.warn("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. Redirecting to mock callback.");
        return res.redirect(`${origin}/api/auth/google/callback?code=mock_google_code&state=${state}`);
    }

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: `${origin}/api/auth/google/callback`,
        scope: 'openid profile email',
        state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

const googleCallback = async (req, res) => {
    const { code } = req.query;
    // Dùng FRONTEND_URL (một origin duy nhất) chứ KHÔNG dùng CLIENT_ORIGIN:
    // CLIENT_ORIGIN là allowlist CORS, có thể chứa nhiều origin cách nhau bởi dấu phẩy.
    const clientOrigin = frontendOrigin();

    try {
        if (!consumeOAuthState(req, res)) {
            return res.redirect(`${clientOrigin}/login?error=oauth_state`);
        }
        if (!isStr(code) || !code) {
            return res.redirect(`${clientOrigin}/login?error=auth_failed`);
        }

        let email, name, googleId, emailVerified;

        // ✅ P0: Từ chối mock code trong production
        if (code === 'mock_google_code') {
            if (process.env.NODE_ENV === 'production') {
                return res.redirect(`${clientOrigin}/login?error=oauth_disabled`);
            }
            email = 'candidate_google@demo.com';
            name = 'Demo Google Candidate';
            googleId = 'mock_google_id_123456';
            emailVerified = true;
        } else {
            const axios = require('axios');
            const tokenRes = await axios.post(
                'https://oauth2.googleapis.com/token',
                {
                    code,
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    redirect_uri: `${backendOrigin()}/api/auth/google/callback`,
                    grant_type: 'authorization_code',
                },
                { timeout: 15000 },
            );

            const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
                timeout: 15000,
            });

            email = profileRes.data.email ? String(profileRes.data.email).toLowerCase() : null;
            name = profileRes.data.name || profileRes.data.given_name || 'Ứng viên Google';
            googleId = profileRes.data.sub;
            emailVerified = profileRes.data.email_verified === true;
        }

        if (!email) {
            return res.redirect(`${clientOrigin}/login?error=email_required`);
        }

        const { user, error } = await resolveOAuthUser({ idField: 'googleId', providerId: googleId, email, emailVerified });
        if (error) return res.redirect(`${clientOrigin}/login?error=${error}`);

        return finishOAuthLogin({ user, name, providerLabel: 'Google', res });
    } catch (error) {
        // Không đưa error.message lên URL: lộ chi tiết nội bộ và nhà cung cấp
        console.error('Google Auth Error:', error.message);
        res.redirect(`${clientOrigin}/login?error=auth_failed`);
    }
};

// ─── Facebook OAuth ───────────────────────────────────────────────────────────
const facebookAuth = (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const origin = backendOrigin();
    if (!origin) {
        return res.status(503).json({ message: 'Chưa cấu hình API_PUBLIC_URL nên không đăng nhập Facebook được.' });
    }
    const state = issueOAuthState(res);

    if (!appId || !appSecret) {
        // ✅ P0: Tắt mock OAuth khi chạy production
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ message: 'Facebook OAuth chưa được cấu hình trên server này.' });
        }
        console.warn("FACEBOOK_APP_ID or FACEBOOK_APP_SECRET is missing. Redirecting to mock callback.");
        return res.redirect(`${origin}/api/auth/facebook/callback?code=mock_facebook_code&state=${state}`);
    }

    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: `${origin}/api/auth/facebook/callback`,
        scope: 'email,public_profile',
        state,
    });
    res.redirect(`https://www.facebook.com/v12.0/dialog/oauth?${params}`);
};

const facebookCallback = async (req, res) => {
    const { code } = req.query;
    const clientOrigin = frontendOrigin();

    try {
        if (!consumeOAuthState(req, res)) {
            return res.redirect(`${clientOrigin}/login?error=oauth_state`);
        }
        if (!isStr(code) || !code) {
            return res.redirect(`${clientOrigin}/login?error=auth_failed`);
        }

        let email, name, facebookId;

        // ✅ P0: Từ chối mock code trong production
        if (code === 'mock_facebook_code') {
            if (process.env.NODE_ENV === 'production') {
                return res.redirect(`${clientOrigin}/login?error=oauth_disabled`);
            }
            email = 'candidate_facebook@demo.com';
            name = 'Demo Facebook Candidate';
            facebookId = 'mock_facebook_id_123456';
        } else {
            const axios = require('axios');
            const tokenRes = await axios.get(`https://graph.facebook.com/v12.0/oauth/access_token`, {
                params: {
                    client_id: process.env.FACEBOOK_APP_ID,
                    client_secret: process.env.FACEBOOK_APP_SECRET,
                    redirect_uri: `${backendOrigin()}/api/auth/facebook/callback`,
                    code,
                },
                timeout: 15000,
            });

            const profileRes = await axios.get(`https://graph.facebook.com/me`, {
                params: { fields: 'id,name,email', access_token: tokenRes.data.access_token },
                timeout: 15000,
            });

            email = profileRes.data.email ? String(profileRes.data.email).toLowerCase() : null;
            name = profileRes.data.name || 'Ứng viên Facebook';
            facebookId = profileRes.data.id;
        }

        // Facebook chỉ trả email đã được xác nhận; không có email thì tạo địa chỉ
        // nội bộ theo id (không liên kết được vào tài khoản nào khác).
        const verified = Boolean(email);
        if (!email) email = `fb_${facebookId}@facebook.com`;

        const { user, error } = await resolveOAuthUser({
            idField: 'facebookId',
            providerId: facebookId,
            email,
            emailVerified: verified || email === `fb_${facebookId}@facebook.com`,
        });
        if (error) return res.redirect(`${clientOrigin}/login?error=${error}`);

        return finishOAuthLogin({ user, name, providerLabel: 'Facebook', res });
    } catch (error) {
        console.error('Facebook Auth Error:', error.message);
        res.redirect(`${clientOrigin}/login?error=auth_failed`);
    }
};

// ─── Mã 6 số: giữ lượt thử NGUYÊN TỬ ──────────────────────────────────────────
//
// Bản cũ đọc số lần sai, so mã, rồi mới cộng 1 và lưu. 20 request song song đều
// đọc thấy "0 lần sai" nên đều được so mã — giới hạn 5 lần vô tác dụng, mã 6 số
// dò được bằng cách bắn song song. Nay mỗi lần thử phải GIÀNH một lượt bằng một
// lệnh update có điều kiện (< 5) trước khi được so mã.
const claimOtpAttempt = async (userId, attemptsField) => {
    const otp = require('../utils/otp');
    return User.findOneAndUpdate(
        { _id: userId, [attemptsField]: { $lt: otp.MAX_ATTEMPTS } },
        { $inc: { [attemptsField]: 1 } },
        { new: true },
    );
};

const codeString = (code) => (isStr(code) || typeof code === 'number' ? String(code).trim() : '');

// ─── Xác thực email bằng mã 6 số ──────────────────────────────────────────────
const verifyEmail = async (req, res) => {
  const { email, code } = req.body || {};
  try {
    if (!isStr(email) || !codeString(code)) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mã xác thực.' });
    }

    const user = await User.findOne({ email: normEmail(email), isDeleted: { $ne: true } });
    if (!user) {
      return res.status(400).json({ message: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ message: BLOCKED_MESSAGE, banned: true });
    }
    if (user.emailVerified !== false) {
      return res.json({ message: 'Tài khoản đã được xác thực. Bạn có thể đăng nhập.', alreadyVerified: true });
    }

    const otp = require('../utils/otp');
    const claimed = await claimOtpAttempt(user._id, 'verificationAttempts');
    if (!claimed) {
      return res.status(400).json({ message: otp.reasonMessage('locked') });
    }

    // Lượt thử đã được tính ở trên, nên truyền attempts = 0 cho bước so mã
    const check = otp.verifyCode({
      input: codeString(code),
      hash: claimed.verificationCode,
      expiresAt: claimed.verificationCodeExpire,
      attempts: 0,
    });
    if (!check.ok) {
      return res.status(400).json({ message: otp.reasonMessage(check.reason) });
    }

    const verified = await User.findOneAndUpdate(
      { _id: user._id, verificationCode: claimed.verificationCode },
      {
        $set: { emailVerified: true, verificationAttempts: 0 },
        $unset: { verificationCode: '', verificationCodeExpire: '' },
      },
      { new: true },
    );
    if (!verified) {
      return res.status(400).json({ message: otp.reasonMessage('missing') });
    }

    // Xác thực xong thì đăng nhập luôn, đỡ bắt gõ lại mật khẩu
    return sendTokenCookie(verified, 200, res);
  } catch (error) {
    console.error('[VerifyEmail]', error.message);
    res.status(500).json({ message: 'Lỗi máy chủ khi xác thực email.' });
  }
};

// ─── Gửi lại mã xác thực ──────────────────────────────────────────────────────
const resendVerification = async (req, res) => {
  const { email } = req.body || {};
  // Trả lời giống nhau dù email có tồn tại hay không, tránh dò tài khoản
  const generic = 'Nếu email tồn tại và chưa xác thực, chúng tôi đã gửi lại mã.';
  try {
    if (!isStr(email) || !email.trim()) return res.status(400).json({ message: 'Vui lòng nhập địa chỉ email.' });

    const user = await User.findOne({
      email: normEmail(email),
      isDeleted: { $ne: true },
      status: { $ne: 'banned' },
    });
    if (!user || user.emailVerified !== false) return res.json({ message: generic });

    const otp = require('../utils/otp');
    const { code, hash, expiresAt } = otp.issueCode();
    user.verificationCode = hash;
    user.verificationCodeExpire = expiresAt;
    user.verificationAttempts = 0;
    await user.save();

    const emailService = require('../services/emailService');
    await emailService.sendVerificationEmail({
      to: user.email,
      fullName: user.email.split('@')[0],
      code,
      minutes: Math.round(otp.TTL_MS / 60000),
    });

    return res.json({ message: generic });
  } catch (error) {
    console.error('[ResendVerification]', error.message);
    return res.json({ message: generic });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  const genericMessage = 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.';

  try {
    if (!isStr(email) || !email.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập địa chỉ email.' });
    }

    const user = await User.findOne({
      email: normEmail(email),
      status: 'active',
      isDeleted: { $ne: true },
    });

    // Anti-user enumeration: Always return generic success message even if email not found
    if (!user) {
      return res.json({ message: genericMessage });
    }

    const otp = require('../utils/otp');
    const { code, hash, expiresAt } = otp.issueCode();

    user.resetPasswordToken = hash;
    user.resetPasswordExpire = expiresAt;
    user.resetPasswordAttempts = 0;
    await user.save();

    const emailService = require('../services/emailService');
    await emailService.sendPasswordResetEmail({
      to: user.email,
      fullName: user.email.split('@')[0],
      code,
      minutes: Math.round(otp.TTL_MS / 60000),
    });

    return res.json({ message: genericMessage });
  } catch (error) {
    console.error('[ForgotPassword Error]:', error.message);
    return res.json({ message: genericMessage });
  }
};

const resetPassword = async (req, res) => {
  const { email, code, password } = req.body || {};

  try {
    if (!isStr(email) || !codeString(code)) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mã xác thực.' });
    }

    if (!isStr(password) || password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const user = await User.findOne({ email: normEmail(email), isDeleted: { $ne: true } });

    if (!user) {
      return res.status(400).json({ message: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ message: BLOCKED_MESSAGE, banned: true });
    }

    const otp = require('../utils/otp');
    const claimed = await claimOtpAttempt(user._id, 'resetPasswordAttempts');
    if (!claimed) {
      return res.status(400).json({ message: otp.reasonMessage('locked') });
    }

    const check = otp.verifyCode({
      input: codeString(code),
      hash: claimed.resetPasswordToken,
      expiresAt: claimed.resetPasswordExpire,
      attempts: 0,
    });

    if (!check.ok) {
      return res.status(400).json({ message: otp.reasonMessage(check.reason) });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    // Điều kiện resetPasswordToken: mã chỉ dùng được một lần kể cả khi hai
    // request đúng mã tới cùng lúc.
    const r = await User.updateOne(
      { _id: user._id, resetPasswordToken: claimed.resetPasswordToken },
      {
        $set: {
          password: hashed,
          resetPasswordAttempts: 0,
          // Đặt lại mật khẩu qua email cũng chứng minh sở hữu hộp thư
          ...(user.emailVerified === false ? { emailVerified: true } : {}),
        },
        // Sinh viên import tự đặt mật khẩu qua "Quên mật khẩu" thì mật khẩu tạm coi
        // như đã được thay — không bắt đổi lần nữa, và hàng đợi thư mời không gửi
        // mật khẩu tạm mới đè lên.
        $unset: { resetPasswordToken: '', resetPasswordExpire: '', mustChangePassword: '' },
      },
    );
    if (!r.modifiedCount) {
      return res.status(400).json({ message: otp.reasonMessage('missing') });
    }

    // Đăng xuất phiên hiện tại (nếu có) — cùng thuộc tính cookie lúc cấp
    res.clearCookie('token', buildCookieOptions());

    return res.json({ message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập với mật khẩu mới.' });
  } catch (error) {
    console.error('[ResetPassword Error]:', error.message);
    res.status(500).json({ message: 'Lỗi máy chủ khi đặt lại mật khẩu.' });
  }
};

// ─── Đổi mật khẩu (dành cho người ĐANG đăng nhập) ─────────────────────────────
// Khác với forgotPassword/resetPassword: luồng kia dành cho người đã mất quyền
// truy cập và xác thực qua mã gửi email. Luồng này xác thực bằng chính mật
// khẩu hiện tại, không gửi email, áp dụng cho mọi role.
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  try {
    if (!isStr(currentPassword) || !isStr(newPassword) || !currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    }

    // protect() nạp user bằng .select('-password') nên phải lấy lại kèm mật khẩu
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    // Tài khoản tạo qua Google/Facebook chưa từng đặt mật khẩu
    if (!user.password) {
      return res.status(400).json({
        message:
          'Tài khoản này đăng nhập bằng mạng xã hội nên chưa có mật khẩu. ' +
          'Dùng chức năng "Quên mật khẩu" để đặt mật khẩu lần đầu.',
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      // 400 chứ không phải 401: phiên đăng nhập vẫn hợp lệ, chỉ là gõ sai mật
      // khẩu. 401 khiến frontend tưởng hết phiên, xoá đăng nhập rồi đá về /login.
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.', field: 'currentPassword' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Vô hiệu hoá mã đặt lại mật khẩu đang treo
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    // Tài khoản import bắt đổi mật khẩu lần đầu — đổi xong thì bỏ cờ đi
    user.mustChangePassword = undefined;

    await user.save();

    // Cấp lại cookie để phiên hiện tại tiếp tục hoạt động sau khi đổi
    return sendTokenCookie(user, 200, res, { message: 'Đổi mật khẩu thành công.' });
  } catch (error) {
    console.error('[ChangePassword Error]:', error.message);
    res.status(500).json({ message: 'Lỗi máy chủ khi đổi mật khẩu.' });
  }
};

module.exports = {
    verifyEmail,
    resendVerification,
    register,
    login,
    logout,
    getCurrentUser,
    getCaptcha,
    googleAuth,
    googleCallback,
    facebookAuth,
    facebookCallback,
    forgotPassword,
    resetPassword,
    changePassword,
};
