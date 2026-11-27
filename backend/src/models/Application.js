const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    candidateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    cvProfileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CvProfile',
        required: true
    },

    matchingScore: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        enum: ['pending', 'reviewed', 'interview', 'accepted', 'rejected'],
        default: 'pending'
    },

    appliedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: false });

// Mỗi ứng viên nộp một lần cho mỗi tin. Kiểm tra "đã nộp chưa" rồi mới tạo là
// không đủ: 5 request song song đều thấy "chưa" và tạo 5 đơn. Index unique
// chặn ở tầng database; controller bắt lỗi 11000 và trả 409.
applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });


module.exports = mongoose.model('Application', applicationSchema);