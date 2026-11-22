const governor = require('../services/mail/governor');
const EmailEvent = require('../models/EmailEvent');
const EmailSuppression = require('../models/EmailSuppression');
const { logAdminAction } = require('../services/auditLogService');

/**
 * Trang quản trị: tình trạng đường gửi mail (3 làn, warm-up, Circuit Breaker,
 * danh sách chặn, lô import bị dừng) và các thao tác tay sau khi đã xử lý sự cố.
 */

const getEmailHealth = async (req, res) => {
  try {
    const [health, recentSignals] = await Promise.all([
      governor.getHealth(),
      EmailEvent.find({ type: { $nin: ['sent', 'delivered', 'request'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('type email lane kind code reason importBatchId createdAt')
        .lean(),
    ]);
    res.json({ data: { ...health, recentSignals } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetBreaker = async (req, res) => {
  try {
    await governor.resetBreaker();
    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'SystemSetting',
      targetId: null,
      details: { setting: 'email_breaker', action: 'reset' },
    });
    res.json({ message: 'Đã đóng Circuit Breaker. Thư mời và thư gợi ý gửi lại theo nhịp bình thường.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const setWarmupStage = async (req, res) => {
  try {
    const stage = await governor.setWarmupStage(req.body?.stage);
    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'SystemSetting',
      targetId: null,
      details: { setting: 'email_warmup_stage', stage },
    });
    res.json({ message: `Đã chuyển sang warm-up bậc ${stage}.`, data: { stage } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resumeBatch = async (req, res) => {
  try {
    const ok = await governor.resumeBatch(req.params.batchId);
    if (!ok) return res.status(404).json({ message: 'Lô này không bị dừng.' });
    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'SystemSetting',
      targetId: null,
      details: { setting: 'email_import_batch', action: 'resume', batchId: req.params.batchId },
    });
    res.json({ message: `Đã mở lại lô ${req.params.batchId}.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Gỡ một địa chỉ khỏi danh sách chặn (vd. người dùng sửa xong hộp thư). */
const removeSuppression = async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase().trim();
    const r = await EmailSuppression.deleteOne({ email });
    if (!r.deletedCount) return res.status(404).json({ message: 'Địa chỉ không nằm trong danh sách chặn.' });
    await logAdminAction({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetModel: 'SystemSetting',
      targetId: null,
      details: { setting: 'email_suppression', action: 'remove', email },
    });
    res.json({ message: `Đã gỡ ${email} khỏi danh sách chặn.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listSuppression = async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim();
    const filter = q ? { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } } : {};
    const rows = await EmailSuppression.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getEmailHealth, resetBreaker, setWarmupStage, resumeBatch, removeSuppression, listSuppression };
