const mongoose = require('mongoose');
const { normalizeText } = require('../utils/normalizeText');

const jobSchema = new mongoose.Schema({
    employerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Chuẩn hoá ngay khi gán: chữ "font hoa mỹ" chép từ mạng xã hội làm hỏng tìm
    // kiếm, embedding và khiến email gợi ý vào Spam (xem utils/normalizeText).
    title: { type: String, required: true, set: normalizeText },
    description: { type: String, required: true },
    requirements: [{ type: String }],
    location: { type: String, set: normalizeText },

    salary: { type: String, default: '' },        
    jobType: { type: String, default: '' },         // VD: "Nhân viên chính thức", "Part-time", "Remote"
    experience: { type: String, default: '' },     
    level: { type: String, default: '' },          
    industry: { type: String, default: '' },       
    // Vị trí chuyên môn (cấp 2 của danh mục nghề) — slug trong frontend/lib/job-categories.ts
    specialization: { type: String, default: '' },
    education: { type: String, default: '' },
    // Lương dạng số để sửa lại được; `salary` ở trên giữ chuỗi đã định dạng cho chỗ hiển thị cũ
    salaryMin: { type: Number, default: null },
    salaryMax: { type: Number, default: null },
    currency: { type: String, default: 'VND' },
    benefits: [{ type: String }],                   

    embedding: {
        type: [Number],
        default: []
    },

    expiresAt: { type: Date },

    // Lượt xem tin. Tách người đã đăng nhập và khách vãng lai vì nhà tuyển dụng
    // cần biết tin tiếp cận được bao nhiêu người ngoài hệ thống.
    // viewCount = viewCountUser + viewCountGuest; giữ sẵn tổng để danh sách tin
    // không phải cộng lại ở mọi chỗ hiển thị. Chi tiết từng người xem: model JobView.
    viewCount: { type: Number, default: 0 },
    viewCountUser: { type: Number, default: 0 },
    viewCountGuest: { type: Number, default: 0 },

    // Mốc đã gửi email nhắc hạn cho tin này. Không có mốc thì cron sẽ nhắc lại
    // mỗi ngày cho tới lúc tin hết hạn — phiền và dễ bị đánh dấu spam.
    lastExpiryReminderAt: { type: Date },
    isEmailEnabled: { type: Boolean, default: true },
    status: {
        type: String,
        enum: ['open', 'closed', 'archived'],
        default: 'open'
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Embedding chỉ dùng nội bộ để chấm điểm — không trả ra client (xem CvProfile.js)
jobSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.embedding;
        return ret;
    },
});

module.exports = mongoose.model('Job', jobSchema);