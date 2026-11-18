const mongoose = require('mongoose');
const { normalizeText } = require('../utils/normalizeText');

const companyProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, 
  },
  companyName: { type: String, default: '', set: normalizeText },

  // Ảnh thương hiệu, lưu dạng data URL (image/jpeg) đã được trình duyệt thu nhỏ.
  // Trang hồ sơ công ty vốn chỉ vẽ một dải gradient ghi "Ảnh bìa công ty" và một
  // ô chữ cái đầu thay cho logo — trông như chỗ đặt ảnh nhưng không có gì phía
  // sau, nên doanh nghiệp không thể đổi được.
  coverImage: { type: String, default: '' },
  logo: { type: String, default: '' },
  industry: {
    type: String,
    enum: ['technology', 'finance', 'healthcare', 'consulting', 'logistics', 'education', 'marketing', 'manufacturing', 'other'],
    default: 'other',
  },
  size: {
    type: String,
    enum: ['startup', 'small', 'medium', 'large'],
    default: 'startup',
  },
  about: { type: String, default: '' },
  website: { type: String, default: '' },
  address: { type: String, default: '' },
  foundedYear: { type: Number },
  benefits: [{ type: String }],
  contactName: { type: String, default: '' },
  phone: { type: String, default: '' },
  taxId: { type: String, default: '' },
  province: { type: String, default: '' },
  country: { type: String, default: 'Việt Nam' },
}, { timestamps: true });

module.exports = mongoose.model('CompanyProfile', companyProfileSchema);
