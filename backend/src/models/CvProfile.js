const mongoose = require('mongoose');

// Ngày tháng trong kinh nghiệm/học vấn đến từ LLM hoặc người dùng gõ tay:
// "Present", "Hiện tại", "05/2020"... Cast thẳng sang Date là ValidationError và
// cả CV bị đánh dấu lỗi bóc tách. Giá trị không đọc được thì coi như trống.
const toDateOrNull = (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const cvProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullName: { type: String, required: true },
    headline: { type: String },
    email: { type: String },
    phone: { type: String },
    location: { type: String },
    address: { type: String },
    dateOfBirth: { type: String },
    website: { type: String },

    // Ảnh chân dung hiển thị trên CV. Lưu dạng data URL (image/jpeg) đã được
    // trình duyệt thu nhỏ về tối đa 320px trước khi gửi lên, nên chỉ vài chục KB
    // và không cần tới kho lưu trữ ngoài.
    photo: { type: String },
    summary: { type: String },
    skills: [{ type: String }],
    certifications: { type: String },

    experience: [{
        company: String,
        position: String,
        description: String,
        startDate: { type: Date, set: toDateOrNull },
        endDate: { type: Date, set: toDateOrNull }
    }],

    education: [{
        school: String,
        major: String,      // Chuyên ngành
        degree: String,     // Bậc học: Đại học / Cao đẳng / Thạc sĩ...
        gpa: String,
        startDate: { type: Date, set: toDateOrNull },
        endDate: { type: Date, set: toDateOrNull }
    }],

    // Ngôn ngữ: { name: 'Tiếng Anh', level: 'IELTS 7.0' }
    languages: [{
        name: String,
        level: String
    }],

    embedding: {
        type: [Number],
        default: []
    },

    isLookingForJob: {
        type: Boolean,
        default: true
    },

    isPrimary: {
        type: Boolean,
        default: false
    },

    fileUrl: { type: String },

    processingStatus: {
        type: String,
        enum: ['queued', 'processing', 'ready', 'failed', 'completed'],
        default: 'ready',
        index: true
    },
    processingError: { type: String },
    attempts: {
        type: Number,
        default: 0
    },
    lastAiAttemptAt: { type: Date }
}, { timestamps: true });

// Vector embedding (768 số thực) chỉ dùng nội bộ để chấm điểm — không trả ra
// client: mỗi CV nặng thêm ~15KB JSON vô ích ở mọi endpoint.
cvProfileSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.embedding;
        return ret;
    },
});

module.exports = mongoose.model('CvProfile', cvProfileSchema);