const User = require('../models/User');
const { findPrimaryOrLatestCv } = require('../utils/primaryCv');
const { safeHttpUrl, isSafeImage } = require('../utils/safeUrl');
const CvProfile = require('../models/CvProfile');
const Application = require('../models/Application');

const updateMySettings = async (req, res) => {
  try {
    const { isEmailSubscribed, isLookingForJob, minMatchScore, jobMatchFrequency, employerDigestLimit, jobExpiryReminder } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (typeof isEmailSubscribed === 'boolean') updateData.isEmailSubscribed = isEmailSubscribed;
    if (typeof minMatchScore === 'number') updateData.minMatchScore = minMatchScore;
    // findByIdAndUpdate không chạy validator của schema, nên phải tự chặn ở đây:
    // không có dòng này thì một giá trị gõ sai vẫn vào được DB và cron lặng lẽ
    // hiểu thành "hằng ngày".
    const FREQUENCIES = ['immediately', 'daily', 'weekly', 'off'];
    if (typeof jobMatchFrequency === 'string') {
      if (!FREQUENCIES.includes(jobMatchFrequency)) {
        return res.status(400).json({
          message: `Tần suất "${jobMatchFrequency}" không hợp lệ. Chọn một trong: ${FREQUENCIES.join(', ')}.`,
        });
      }
      updateData.jobMatchFrequency = jobMatchFrequency;
    }
    if (typeof employerDigestLimit === 'number' && employerDigestLimit >= 0) {
      updateData.employerDigestLimit = Math.floor(employerDigestLimit);
    }
    if (typeof jobExpiryReminder === 'boolean') updateData.jobExpiryReminder = jobExpiryReminder;

    if (Object.keys(updateData).length > 0) {
      await User.findByIdAndUpdate(userId, updateData);
    }

    if (typeof isLookingForJob === 'boolean') {
      const cv = await findPrimaryOrLatestCv(userId);
      if (cv) {
        cv.isLookingForJob = isLookingForJob;
        await cv.save();
      }
    }

    const updatedUser = await User.findById(userId).select('-password');
    res.json({ message: 'Cập nhật cài đặt thành công', data: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    // CV chính (isPrimary) trước — thống nhất với trang gợi ý việc làm và nộp đơn
    const cv = await findPrimaryOrLatestCv(userId);
    res.json({
      data: {
        user: {
          _id: req.user._id,
          email: req.user.email,
          role: req.user.role,
          isEmailSubscribed: req.user.isEmailSubscribed,
          minMatchScore: req.user.minMatchScore,
          jobMatchFrequency: req.user.jobMatchFrequency,
          employerDigestLimit: req.user.employerDigestLimit,
          jobExpiryReminder: req.user.jobExpiryReminder,
          status: req.user.status,
        },
        cv: cv || null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getEmployerStats = async (req, res) => {
  try {
    const Job = require('../models/Job');
    const userId = req.user._id;

    const myJobs = await Job.find({ employerId: userId }).select('_id');
    const jobIds = myJobs.map((j) => j._id);

    if (jobIds.length === 0) {
      return res.json({ data: { totalApplications: 0, avgMatchScore: 0 } });
    }

    const apps = await Application.find({ jobId: { $in: jobIds } }).select('matchingScore');
    const totalApplications = apps.length;
    const avgMatchScore =
      totalApplications > 0
        ? Math.round(apps.reduce((s, a) => s + (a.matchingScore || 0), 0) / totalApplications)
        : 0;

    res.json({ data: { totalApplications, avgMatchScore } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCompanyProfile = async (req, res) => {
  try {
    const CompanyProfile = require('../models/CompanyProfile');
    const userId = req.user._id;
    // Tạo-nếu-chưa-có bằng MỘT lệnh upsert: findOne rồi create thì vài request
    // đồng thời lần đầu (nhiều tab, React StrictMode) cùng tạo và nổ E11000.
    let profile;
    try {
      profile = await CompanyProfile.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, companyName: req.user.email.split('@')[0] } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      profile = await CompanyProfile.findOne({ userId });
    }

    res.json({ data: profile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCompanyProfile = async (req, res) => {
  try {
    const CompanyProfile = require('../models/CompanyProfile');
    const userId = req.user._id;

    const allowedFields = [
      'companyName', 'industry', 'size', 'about', 'website',
      'address', 'foundedYear', 'benefits', 'country', 'province',
      'contactName', 'phone', 'taxId', 'coverImage', 'logo'
    ];
    const updateData = {};
    allowedFields.forEach((f) => {
      if (typeof req.body[f] !== 'undefined') updateData[f] = req.body[f];
    });

    // website chỉ nhận http/https — "javascript:alert(1)" từng được lưu nguyên
    // văn rồi gắn vào <a href> trên trang việc làm công khai.
    if (updateData.website !== undefined) {
      const safe = safeHttpUrl(updateData.website);
      if (safe === null) {
        return res.status(400).json({ message: 'Website phải là địa chỉ http:// hoặc https:// hợp lệ.' });
      }
      updateData.website = safe;
    }
    // Ảnh chỉ nhận JPEG/PNG/WebP — SVG chứa được mã script
    for (const f of ['logo', 'coverImage']) {
      if (updateData[f] !== undefined && !isSafeImage(updateData[f])) {
        return res.status(400).json({ message: 'Logo và ảnh bìa phải là ảnh JPEG, PNG hoặc WebP.' });
      }
    }

    // runValidators: findOneAndUpdate mặc định KHÔNG kiểm tra enum, nên
    // industry="NOT_A_VALID_INDUSTRY" trước đây được lưu thẳng.
    const profile = await CompanyProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.json({ message: 'Cập nhật hồ sơ công ty thành công', data: profile });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: 'Dữ liệu hồ sơ công ty không hợp lệ.' });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = { updateMySettings, getMyProfile, getEmployerStats, getCompanyProfile, updateCompanyProfile };
