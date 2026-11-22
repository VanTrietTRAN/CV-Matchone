const EmailHealthState = require('../../models/EmailHealthState');
const EmailEvent = require('../../models/EmailEvent');
const EmailSuppression = require('../../models/EmailSuppression');
const policy = require('./policy');
const { notifyOps } = require('./opsAlert');

/**
 * Bộ điều phối của đường gửi mail. Mọi lượt gửi đều phải xin phép ở đây
 * (`reserve`) trước khi đụng tới SMTP:
 *
 *   - giữ quota theo 3 làn ưu tiên và trần cứng của gói gửi;
 *   - giữ nhịp gửi P1/P2 (giãn cách, trần theo giờ, khung giờ, ngày nghỉ);
 *   - giữ trạng thái Circuit Breaker và chuyển trạng thái khi có tín hiệu xấu;
 *   - giữ danh sách chặn (suppression list) và các lô import bị dừng.
 *
 * Con số và ngưỡng nằm ở policy.js; file này chỉ lo phần database.
 */

const ID = 'singleton';
const { LANES, BREAKER, THRESHOLDS } = policy;
const laneKey = (lane) => (lane === LANES.P0 ? 'p0' : lane === LANES.P1 ? 'p1' : 'p2');

const HARD_TYPES = ['hard_bounce', 'invalid_email'];
const SOFT_TYPES = ['soft_bounce', 'deferred'];

const fmtTime = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

// ─── Trạng thái ──────────────────────────────────────────────────────────────

const ensureState = async (now) => {
  const existing = await EmailHealthState.findById(ID).lean();
  if (existing) return existing;
  const clock = policy.vnClock(now);
  try {
    await EmailHealthState.create({
      _id: ID,
      quotaDate: clock.dateKey,
      hourKey: clock.hourKey,
      warmupStage: 1,
      warmupStageSince: now,
    });
    console.log('[MailGovernor] Khởi tạo trạng thái gửi mail: bắt đầu warm-up tuần 1.');
  } catch (e) {
    if (e.code !== 11000) throw e; // tiến trình khác vừa tạo trước
  }
  return EmailHealthState.findById(ID).lean();
};

/**
 * Đọc trạng thái và làm các bước chuyển theo thời gian: sang ngày mới thì xoá
 * bộ đếm ngày (và xét lên bậc warm-up), sang giờ mới thì xoá bộ đếm giờ, hết
 * thời gian nghỉ thì breaker tự chuyển bậc.
 */
const loadState = async (now = new Date()) => {
  let state = await ensureState(now);
  const clock = policy.vnClock(now);
  let changed = false;

  if (state.quotaDate !== clock.dateKey) {
    const r = await EmailHealthState.updateOne(
      { _id: ID, quotaDate: state.quotaDate ?? null },
      {
        $set: {
          quotaDate: clock.dateKey,
          p0SentToday: 0,
          p1SentToday: 0,
          p2SentToday: 0,
          totalSentToday: 0,
        },
      },
    );
    if (r.modifiedCount) await maybeAdvanceWarmup(state, now);
    changed = true;
  }

  if (state.hourKey !== clock.hourKey) {
    await EmailHealthState.updateOne(
      { _id: ID, hourKey: state.hourKey ?? null },
      { $set: { hourKey: clock.hourKey, p1SentThisHour: 0, p2SentThisHour: 0 } },
    );
    changed = true;
  }

  const next = policy.timeTransition(state, now);
  if (next) {
    await applyTimeTransition(state, next, now);
    changed = true;
  }

  if (changed) state = await EmailHealthState.findById(ID).lean();
  return state;
};

const applyTimeTransition = async (state, next, now) => {
  const set = { breakerState: next };
  if (next === BREAKER.HALF_OPEN) {
    Object.assign(set, { halfOpenSince: now, probeSent: 0, resumeAt: null });
  } else {
    Object.assign(set, { halfOpenSince: null, probeSent: 0, resumeAt: null, smtpErrorStreak: 0 });
  }
  const r = await EmailHealthState.updateOne({ _id: ID, breakerState: state.breakerState }, { $set: set });
  if (!r.modifiedCount) return;

  if (next === BREAKER.HALF_OPEN) {
    console.warn(
      `[MailGovernor] Hết thời gian ngắt — chuyển HALF_OPEN, gửi thăm dò tối đa ${THRESHOLDS.halfOpenProbe} thư.`,
    );
  } else if (state.breakerState === BREAKER.HALF_OPEN) {
    notifyOps('Circuit Breaker đã ĐÓNG lại: 24h thăm dò không có spam/hard bounce. Thư mời và thư gợi ý gửi lại bình thường.');
  } else {
    console.log('[MailGovernor] Hết thời gian giảm tốc — breaker về CLOSED.');
  }
};

// ─── Xin suất gửi ────────────────────────────────────────────────────────────

/** Xem trước có gửi được không, KHÔNG giữ suất. Worker dùng để khỏi truy vấn thừa. */
const peek = async (lane, units = 1, now = new Date()) => {
  try {
    const state = await loadState(now);
    const d = policy.evaluate(state, lane, units, now);
    return { ok: d.allowed, reason: d.reason, retryAt: d.retryAt };
  } catch (e) {
    return { ok: lane === LANES.P0, reason: `Không đọc được trạng thái gửi mail: ${e.message}` };
  }
};

/**
 * Giữ `units` suất ở làn `lane`. Tăng bộ đếm bằng MỘT lệnh update có điều kiện
 * nên hai lượt gửi đồng thời không thể cùng lọt qua trần.
 *
 * P0 (đổi mật khẩu) đi theo nguyên tắc "thà gửi còn hơn kẹt": database trục
 * trặc thì vẫn cho gửi, chỉ là không đếm được.
 *
 * @returns {{ok: true, lane, units} | {ok: false, reason, retryAt?}}
 */
const reserve = async (lane, units = 1, now = new Date()) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let state;
    try {
      state = await loadState(now);
    } catch (e) {
      if (lane === LANES.P0) return { ok: true, lane, units, untracked: true };
      return { ok: false, reason: `Không đọc được trạng thái gửi mail: ${e.message}` };
    }

    const d = policy.evaluate(state, lane, units, now);
    if (!d.allowed) return { ok: false, reason: d.reason, retryAt: d.retryAt };

    const key = laneKey(lane);
    const { provider } = policy.limits();
    const filter = {
      _id: ID,
      quotaDate: state.quotaDate,
      totalSentToday: { $lte: provider - units },
    };
    const inc = { [`${key}SentToday`]: units, totalSentToday: units };
    const set = {};

    if (lane !== LANES.P0) {
      Object.assign(filter, {
        breakerState: state.breakerState,
        hourKey: state.hourKey,
        [`${key}SentToday`]: { $lte: d.cap - units },
        [`${key}SentThisHour`]: { $lte: d.hourCap - units },
        $or: [{ [`${key}NextAt`]: null }, { [`${key}NextAt`]: { $lte: now } }],
      });
      inc[`${key}SentThisHour`] = units;
      set[`${key}NextAt`] = new Date(now.getTime() + d.gapMs);
      if (state.breakerState === BREAKER.HALF_OPEN) {
        filter.probeSent = { $lte: THRESHOLDS.halfOpenProbe - units };
        inc.probeSent = units;
      }
    }

    try {
      const r = await EmailHealthState.updateOne(filter, {
        $inc: inc,
        ...(Object.keys(set).length ? { $set: set } : {}),
      });
      if (r.modifiedCount) return { ok: true, lane, units };
    } catch (e) {
      if (lane === LANES.P0) return { ok: true, lane, units, untracked: true };
      return { ok: false, reason: e.message };
    }
    // Lượt gửi khác vừa đổi trạng thái — đọc lại và thử lần nữa
  }
  if (lane === LANES.P0) return { ok: true, lane, units, untracked: true };
  return { ok: false, reason: 'Lượt gửi khác vừa giành suất này — thử lại ở lượt sau.' };
};

/** Trả lại suất khi SMTP từ chối: thư không đi thì Brevo cũng không tính. */
const release = async (reservation) => {
  if (!reservation?.ok || reservation.untracked) return;
  const key = laneKey(reservation.lane);
  const inc = { [`${key}SentToday`]: -reservation.units, totalSentToday: -reservation.units };
  if (reservation.lane !== LANES.P0) inc[`${key}SentThisHour`] = -reservation.units;
  try {
    await EmailHealthState.updateOne({ _id: ID }, { $inc: inc });
  } catch (e) {
    console.error('[MailGovernor] Không trả lại được suất gửi:', e.message);
  }
};

// ─── Ghi nhận kết quả gửi ────────────────────────────────────────────────────

const recordSent = async ({ lane, kind, recipients, messageId, importBatchId }) => {
  try {
    await EmailEvent.insertMany(
      recipients.map((email) => ({
        type: 'sent',
        email,
        lane,
        kind,
        messageId,
        importBatchId,
        source: 'smtp',
      })),
      { ordered: false },
    );
    await EmailHealthState.updateOne({ _id: ID, smtpErrorStreak: { $gt: 0 } }, { $set: { smtpErrorStreak: 0 } });
  } catch (e) {
    console.error('[MailGovernor] Không ghi được sự kiện gửi:', e.message);
  }
};

/** Lỗi trả về ngay từ Nodemailer. Chỉ các mã 421/451/550 mới tính vào chuỗi lỗi liên tiếp. */
const recordSmtpError = async ({ error, lane, kind, recipients }) => {
  const code = Number(error?.responseCode) || null;
  try {
    await EmailEvent.create({
      type: 'smtp_error',
      email: recipients?.[0],
      lane,
      kind,
      code,
      reason: String(error?.message || error).slice(0, 500),
      source: 'smtp',
    });
    if (!code || !THRESHOLDS.smtp.codes.includes(code)) return;

    const state = await EmailHealthState.findOneAndUpdate(
      { _id: ID },
      { $inc: { smtpErrorStreak: 1 } },
      { new: true },
    ).lean();
    const judgement = policy.judgeSmtpStreak(state?.smtpErrorStreak || 0, code);
    if (judgement) {
      await trip(judgement, { detail: String(error?.message || '').slice(0, 300) });
    }
  } catch (e) {
    console.error('[MailGovernor] Không ghi được lỗi SMTP:', e.message);
  }
};

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

const trip = async (judgement, { detail } = {}, now = new Date()) => {
  const state = await loadState(now);
  const step = policy.escalate(state, judgement.target, judgement.ms, judgement.reason, now);
  if (!step) return null;

  const r = await EmailHealthState.updateOne(
    { _id: ID, breakerState: state.breakerState },
    {
      $set: {
        breakerState: step.state,
        resumeAt: step.resumeAt,
        lastTripReason: step.reason,
        lastTripAt: now,
        halfOpenSince: null,
        probeSent: 0,
      },
    },
  );
  if (!r.modifiedCount) return null;

  const action =
    step.state === BREAKER.OPEN ? 'NGẮT thư mời (P1) và thư gợi ý (P2)' : 'GIẢM TỐC: tắt P2, P1 còn 50%, 1 thư/2 phút';
  notifyOps(
    `Circuit Breaker → ${step.state} tới ${fmtTime(step.resumeAt)}. Lý do: ${step.reason}. ` +
      `Hành động: ${action}. Thư đổi mật khẩu (P0) vẫn gửi bình thường.` +
      (detail ? ` Chi tiết: ${detail}` : ''),
  );
  return step;
};

/** Đếm tín hiệu theo cửa sổ thời gian. */
const countEvents = (types, sinceMs, now = new Date(), extra = {}) =>
  EmailEvent.countDocuments({
    type: { $in: [].concat(types) },
    createdAt: { $gte: new Date(now.getTime() - sinceMs) },
    ...extra,
  });

const HOUR = 60 * 60 * 1000;

/**
 * Xử lý một sự kiện từ webhook Brevo (đã chuẩn hoá ở webhookController).
 * @param {{type: string, email?: string, messageId?: string, reason?: string}} ev
 */
const handleProviderEvent = async (ev, now = new Date()) => {
  const email = String(ev.email || '').toLowerCase().trim();

  // Ghép với lượt gửi gốc để biết thư thuộc làn nào, lô import nào
  let origin = null;
  if (ev.messageId) {
    origin = await EmailEvent.findOne({ type: 'sent', messageId: ev.messageId }).lean();
  }
  if (!origin && email) {
    origin = await EmailEvent.findOne({ type: 'sent', email }).sort({ createdAt: -1 }).lean();
  }
  let importBatchId = origin?.importBatchId;
  if (!importBatchId && email && HARD_TYPES.includes(ev.type)) {
    const User = require('../../models/User');
    const u = await User.findOne({ email }).select('importBatchId').lean();
    importBatchId = u?.importBatchId;
  }

  await EmailEvent.create({
    type: ev.type,
    email: email || undefined,
    messageId: ev.messageId,
    lane: origin?.lane,
    kind: origin?.kind,
    importBatchId,
    reason: ev.reason ? String(ev.reason).slice(0, 500) : undefined,
    source: 'webhook',
  });

  const state = await loadState(now);
  const probing = state.breakerState === BREAKER.HALF_OPEN;

  switch (ev.type) {
    case 'spam': {
      if (email) await suppress(email, 'spam', 'webhook', ev.reason);
      await trip(
        { target: BREAKER.OPEN, ms: THRESHOLDS.spam.openMs, reason: `báo cáo spam từ ${email || 'người nhận'}` },
        {},
        now,
      );
      break;
    }
    case 'hard_bounce':
    case 'invalid_email': {
      if (email) await suppress(email, ev.type === 'invalid_email' ? 'invalid' : 'hard_bounce', 'webhook', ev.reason);
      const count = await countEvents(HARD_TYPES, 24 * HOUR, now);
      const judgement = probing
        ? { target: BREAKER.OPEN, ms: THRESHOLDS.hardBounce.openMs, reason: `hard bounce trong lúc gửi thăm dò (${email})` }
        : policy.judgeHardBounce(count);
      if (judgement) await trip(judgement, {}, now);

      // Dừng riêng lô import đang sinh bounce để rà lại dữ liệu gốc, các lô sạch vẫn chạy
      if (importBatchId) {
        const batchCount = await countEvents(HARD_TYPES, 24 * HOUR, now, { importBatchId });
        if (batchCount >= THRESHOLDS.hardBounce.throttle || judgement) {
          await pauseBatch(importBatchId, `${batchCount} hard bounce trong 24h`);
        }
      }
      break;
    }
    case 'blocked': {
      // Brevo từ chối vì địa chỉ đã nằm trong danh sách chặn bên đó
      if (email) await suppress(email, 'blocked', 'webhook', ev.reason);
      break;
    }
    case 'unsubscribed': {
      if (email) await unsubscribe(email, 'webhook');
      break;
    }
    case 'soft_bounce':
    case 'deferred': {
      const [count, sent] = await Promise.all([
        countEvents(SOFT_TYPES, HOUR, now),
        countEvents('sent', HOUR, now),
      ]);
      const judgement = policy.judgeSoftBounce(count, sent);
      if (judgement) await trip(judgement, {}, now);
      break;
    }
    default:
      break; // delivered, opened, click... chỉ ghi lại
  }
};

// ─── Danh sách chặn ──────────────────────────────────────────────────────────

const suppress = async (email, reason, source, detail) => {
  const addr = String(email || '').toLowerCase().trim();
  if (!addr) return;
  try {
    // Giữ lý do đầu tiên: địa chỉ đã bị chặn vì spam thì không ghi đè thành 'blocked'
    await EmailSuppression.updateOne(
      { email: addr },
      { $setOnInsert: { email: addr, reason, source, detail: detail ? String(detail).slice(0, 300) : undefined } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code !== 11000) console.error('[MailGovernor] Không thêm được vào danh sách chặn:', e.message);
  }
};

/** Trả về Map email → lý do của những địa chỉ đang bị chặn. */
const suppressedAmong = async (emails) => {
  const list = [...new Set(emails.map((e) => String(e || '').toLowerCase().trim()).filter(Boolean))];
  if (!list.length) return new Map();
  const rows = await EmailSuppression.find({ email: { $in: list } }).select('email reason').lean();
  return new Map(rows.map((r) => [r.email, r.reason]));
};

/** Người nhận tự huỷ đăng ký: chặn P2 và tắt luôn công tắc email trong tài khoản. */
const unsubscribe = async (email, source) => {
  const addr = String(email || '').toLowerCase().trim();
  if (!addr) return;
  await suppress(addr, 'unsubscribed', source);
  const User = require('../../models/User');
  await User.updateOne({ email: addr }, { $set: { isEmailSubscribed: false } });
};

// ─── Lô import ───────────────────────────────────────────────────────────────

const pauseBatch = async (batchId, reason) => {
  const r = await EmailHealthState.updateOne(
    { _id: ID, 'pausedBatches.batchId': { $ne: batchId } },
    { $push: { pausedBatches: { batchId, reason, at: new Date() } } },
  );
  if (r.modifiedCount) {
    notifyOps(`Đã DỪNG lô import ${batchId} (${reason}). Rà lại file gốc rồi mở lại ở trang Hệ thống.`);
  }
};

const resumeBatch = async (batchId) => {
  const r = await EmailHealthState.updateOne({ _id: ID }, { $pull: { pausedBatches: { batchId } } });
  return r.modifiedCount > 0;
};

const pausedBatchIds = async () => {
  const state = await EmailHealthState.findById(ID).select('pausedBatches').lean();
  return (state?.pausedBatches || []).map((b) => b.batchId);
};

// ─── Warm-up ─────────────────────────────────────────────────────────────────

const maybeAdvanceWarmup = async (state, now = new Date()) => {
  try {
    const week = 7 * 24 * HOUR;
    const [sent, hardBounce, spam] = await Promise.all([
      countEvents('sent', week, now),
      countEvents(HARD_TYPES, week, now),
      countEvents('spam', week, now),
    ]);
    if (!policy.canAdvanceWarmup(state, { sent, hardBounce, spam }, now)) return;

    const r = await EmailHealthState.updateOne(
      { _id: ID, warmupStage: state.warmupStage || 1 },
      { $set: { warmupStage: (state.warmupStage || 1) + 1, warmupStageSince: now } },
    );
    if (r.modifiedCount) {
      const next = (state.warmupStage || 1) + 1;
      console.log(`[MailGovernor] 7 ngày sạch (${sent} thư, ${hardBounce} hard bounce, 0 spam) → lên warm-up ${policy.WARMUP[next].label}.`);
    }
  } catch (e) {
    console.error('[MailGovernor] Không xét được bậc warm-up:', e.message);
  }
};

// ─── Cho trang quản trị ──────────────────────────────────────────────────────

const setWarmupStage = async (stage) => {
  const n = Math.min(policy.MAX_STAGE, Math.max(1, Number(stage) || 1));
  await ensureState(new Date());
  await EmailHealthState.updateOne({ _id: ID }, { $set: { warmupStage: n, warmupStageSince: new Date() } });
  return n;
};

/** Admin đóng breaker bằng tay sau khi đã xử lý nguyên nhân. */
const resetBreaker = async () => {
  await ensureState(new Date());
  await EmailHealthState.updateOne(
    { _id: ID },
    {
      $set: {
        breakerState: BREAKER.CLOSED,
        resumeAt: null,
        halfOpenSince: null,
        probeSent: 0,
        smtpErrorStreak: 0,
      },
    },
  );
};

const getHealth = async (now = new Date()) => {
  const state = await loadState(now);
  const caps = policy.laneCaps(state, now);
  const EmailOutbox = require('../../models/EmailOutbox');

  const [signals24h, soft1h, sent1h, suppression, outbox] = await Promise.all([
    EmailEvent.aggregate([
      { $match: { createdAt: { $gte: new Date(now.getTime() - 24 * HOUR) } } },
      { $group: { _id: '$type', n: { $sum: 1 } } },
    ]),
    countEvents(SOFT_TYPES, HOUR, now),
    countEvents('sent', HOUR, now),
    EmailSuppression.aggregate([{ $group: { _id: '$reason', n: { $sum: 1 } } }]),
    EmailOutbox.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const toObj = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
  const stage = policy.effectiveStage(state);

  return {
    breaker: {
      state: state.breakerState,
      resumeAt: state.resumeAt,
      lastTripReason: state.lastTripReason,
      lastTripAt: state.lastTripAt,
      halfOpenSince: state.halfOpenSince,
      probeSent: state.probeSent,
      probeLimit: THRESHOLDS.halfOpenProbe,
      smtpErrorStreak: state.smtpErrorStreak,
    },
    quota: {
      date: state.quotaDate,
      providerLimit: caps.limits.provider,
      softCap: caps.limits.softCap,
      buffer: caps.limits.buffer,
      cooldownToday: caps.cooldown,
      lanes: [
        { lane: 0, label: policy.LANE_LABELS[0], sent: state.p0SentToday, cap: caps.limits.p0Reserve, reserved: true },
        { lane: 1, label: policy.LANE_LABELS[1], sent: state.p1SentToday, cap: caps.p1, fullCap: caps.limits.p1 },
        { lane: 2, label: policy.LANE_LABELS[2], sent: state.p2SentToday, cap: caps.p2, fullCap: caps.limits.p2 },
      ],
      totalSent: state.totalSentToday,
    },
    warmup: {
      stage,
      forced: stage !== (state.warmupStage || 1),
      label: policy.WARMUP[stage].label,
      since: state.warmupStageSince,
      activeDays: policy.WARMUP[stage].activeDays,
    },
    signals: { last24h: toObj(signals24h), softLastHour: soft1h, sentLastHour: sent1h },
    suppression: toObj(suppression),
    outbox: toObj(outbox),
    pausedBatches: state.pausedBatches || [],
    config: {
      webhookConfigured: Boolean(String(process.env.BREVO_WEBHOOK_TOKEN || '').trim()),
      unsubscribeConfigured: Boolean(String(process.env.API_PUBLIC_URL || '').trim()),
      alertChannels: [
        process.env.EMAIL_ALERT_SLACK_WEBHOOK && 'Slack',
        process.env.EMAIL_ALERT_TELEGRAM_BOT_TOKEN && process.env.EMAIL_ALERT_TELEGRAM_CHAT_ID && 'Telegram',
      ].filter(Boolean),
      p2Window: `${policy.P2_WINDOW.startHour}:00–${policy.P2_WINDOW.endHour}:00`,
      cooldownWeekdays: policy.cooldownWeekdays(),
    },
  };
};

/** Số ngày gần nhất người nhận P2 phải còn hoạt động, theo bậc warm-up hiện tại. */
const activeWindowDays = async () => {
  try {
    const state = await loadState();
    return policy.WARMUP[policy.effectiveStage(state)].activeDays;
  } catch {
    return 30;
  }
};

/** Trần P2 ở trạng thái hiện tại — dùng để cron không xếp hàng quá sức gửi trong 48h. */
const p2DailyCap = async () => {
  try {
    const state = await loadState();
    const stageCap = Math.round(policy.limits().p2 * policy.WARMUP[policy.effectiveStage(state)].p2);
    return stageCap;
  } catch {
    return 0;
  }
};

module.exports = {
  loadState,
  peek,
  reserve,
  release,
  recordSent,
  recordSmtpError,
  handleProviderEvent,
  trip,
  suppress,
  suppressedAmong,
  unsubscribe,
  pauseBatch,
  resumeBatch,
  pausedBatchIds,
  setWarmupStage,
  resetBreaker,
  getHealth,
  activeWindowDays,
  p2DailyCap,
};
