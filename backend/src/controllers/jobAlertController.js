const JobAlert = require('../models/JobAlert');

const ALLOWED_FREQUENCY = ['daily', 'weekly'];
// Mỗi alert là một thư tiềm năng mỗi ngày — giới hạn để một tài khoản không tự
// biến thành nguồn gửi thư hàng loạt.
const MAX_ALERTS_PER_USER = 10;

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Lấy & làm sạch dữ liệu alert từ body.
 *
 * - Email nhận LUÔN là email tài khoản đã xác thực. Trước đây nhận bất kỳ địa
 *   chỉ nào client gửi lên, tức là dùng hệ thống để gửi thư tới người lạ —
 *   đúng kiểu bị báo spam.
 * - `partial`: chỉ lấy những trường có mặt trong body (cho PUT). Bản cũ dựng
 *   lại đủ mọi trường với giá trị mặc định, nên PUT chỉ gửi { keyword } là xoá
 *   trắng địa điểm, mức lương, tần suất...
 */
const buildAlertPayload = (body, user, { partial = false } = {}) => {
  const has = (k) => !partial || body[k] !== undefined;
  const payload = {};
  if (has('keyword')) payload.keyword = str(body.keyword, 100);
  if (has('location')) payload.location = str(body.location);
  if (has('minSalary')) payload.minSalary = Math.max(0, Number(body.minSalary) || 0);
  if (has('experience')) payload.experience = str(body.experience, 50);
  if (has('jobType')) payload.jobType = str(body.jobType, 50);
  if (has('frequency')) payload.frequency = ALLOWED_FREQUENCY.includes(body.frequency) ? body.frequency : 'daily';
  if (has('agreedToTerms')) payload.agreedToTerms = !!body.agreedToTerms;
  if (body.minMatchScore !== undefined) {
    payload.minMatchScore = Math.min(100, Math.max(0, Number(body.minMatchScore) || 50));
  }
  if (body.isActive !== undefined) {
    payload.isActive = !!body.isActive;
  }
  payload.email = String(user.email || '').toLowerCase();
  return payload;
};

// POST /api/job-alerts
const createJobAlert = async (req, res) => {
  try {
    const payload = buildAlertPayload(req.body, req.user);

    if (!payload.keyword) {
      return res.status(400).json({ message: 'Vui lòng nhập từ khoá tìm kiếm' });
    }
    if (!payload.agreedToTerms) {
      return res
        .status(400)
        .json({ message: 'Bạn cần đồng ý cho phép sử dụng dữ liệu để nhận thông báo' });
    }

    const count = await JobAlert.countDocuments({ userId: req.user._id });
    if (count >= MAX_ALERTS_PER_USER) {
      return res.status(400).json({
        message: `Mỗi tài khoản tạo tối đa ${MAX_ALERTS_PER_USER} thông báo việc làm. Hãy xoá bớt thông báo cũ.`,
      });
    }

    const alert = await JobAlert.create({ ...payload, userId: req.user._id });
    res.status(201).json({ message: 'Đã tạo thông báo việc làm', data: alert });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/job-alerts (của tôi)
const getMyJobAlerts = async (req, res) => {
  try {
    const alerts = await JobAlert.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ data: alerts, limit: MAX_ALERTS_PER_USER });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Tìm alert thuộc về user hiện tại, hoặc trả về null + gửi response lỗi. */
const findOwnedAlert = async (req, res) => {
  const alert = await JobAlert.findById(req.params.id);
  if (!alert) {
    res.status(404).json({ message: 'Không tìm thấy thông báo việc làm' });
    return null;
  }
  if (alert.userId.toString() !== req.user._id.toString()) {
    res.status(403).json({ message: 'Không có quyền' });
    return null;
  }
  return alert;
};

// PUT /api/job-alerts/:id — cập nhật một phần
const updateJobAlert = async (req, res) => {
  try {
    const alert = await findOwnedAlert(req, res);
    if (!alert) return;

    const payload = buildAlertPayload(req.body, req.user, { partial: true });
    if (payload.keyword !== undefined && !payload.keyword) {
      return res.status(400).json({ message: 'Vui lòng nhập từ khoá tìm kiếm' });
    }

    Object.assign(alert, payload);
    await alert.save();
    res.json({ message: 'Đã cập nhật thông báo việc làm', data: alert });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/job-alerts/:id/toggle - bật/tắt nhanh
const toggleJobAlert = async (req, res) => {
  try {
    const alert = await findOwnedAlert(req, res);
    if (!alert) return;

    alert.isActive = !alert.isActive;
    await alert.save();
    res.json({ message: alert.isActive ? 'Đã bật thông báo' : 'Đã tắt thông báo', data: alert });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/job-alerts/:id
const deleteJobAlert = async (req, res) => {
  try {
    const alert = await findOwnedAlert(req, res);
    if (!alert) return;

    await alert.deleteOne();
    res.json({ message: 'Đã xoá thông báo việc làm' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createJobAlert,
  getMyJobAlerts,
  updateJobAlert,
  toggleJobAlert,
  deleteJobAlert,
  MAX_ALERTS_PER_USER,
};
