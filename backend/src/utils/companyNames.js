const CompanyProfile = require('../models/CompanyProfile');

/**
 * Gắn `companyName` (và logo) cho danh sách tin tuyển dụng.
 *
 * Trang việc làm công khai trước đây hiển thị `employerId.email` — tức email
 * ĐĂNG NHẬP của nhà tuyển dụng — ở chỗ tên công ty. Mọi danh sách tin trả ra
 * client nay mang tên công ty lấy từ CompanyProfile, bằng MỘT truy vấn cho cả
 * danh sách. Email đăng nhập bị gỡ khỏi employerId.
 *
 * @param {object[]} jobs  job dạng plain object (lean / toObject), employerId đã populate hoặc là id
 * @returns {Promise<object[]>} chính mảng đó, đã gắn companyName/companyLogo
 */
const attachCompanyNames = async (jobs) => {
  const list = (jobs || []).filter(Boolean);
  const idOf = (job) => String(job.employerId?._id || job.employerId || '');
  const ids = [...new Set(list.map(idOf).filter(Boolean))];
  if (!ids.length) return jobs;

  const profiles = await CompanyProfile.find({ userId: { $in: ids } })
    .select('userId companyName logo')
    .lean();
  const byUser = new Map(profiles.map((p) => [String(p.userId), p]));

  for (const job of list) {
    const p = byUser.get(idOf(job));
    job.companyName = p?.companyName || job.companyName || 'Nhà tuyển dụng';
    if (p?.logo && !job.companyLogo) job.companyLogo = p.logo;
    if (job.employerId && typeof job.employerId === 'object') {
      delete job.employerId.email;
    }
  }
  return jobs;
};

module.exports = { attachCompanyNames };
