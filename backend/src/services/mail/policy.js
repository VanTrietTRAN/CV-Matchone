/**
 * Chính sách gửi mail: 3 làn ưu tiên, trần mềm, lộ trình tăng tải và ngưỡng
 * Circuit Breaker. Toàn bộ là hàm thuần — không đọc database, không gửi gì —
 * để kiểm tra được bằng tay và để mọi con số nằm ở MỘT chỗ.
 *
 * Bối cảnh: thư rơi vào Spam không phải vì mốc 300 thư/ngày, mà vì chạy kịch
 * trần nhiều ngày liền bằng danh sách import lạnh, trộn chung với thư đổi mật
 * khẩu. Nên:
 *
 *   P0 · Bảo mật (mã đặt lại mật khẩu, mã xác thực email)
 *        gửi ngay, giữ riêng 60 lượt/ngày, KHÔNG bao giờ bị breaker ngắt.
 *   P1 · Thư mời tài khoản import — tối đa 100/ngày, 15–20 thư/giờ, giãn 60–90 giây.
 *   P2 · Thư gợi ý/tổng hợp — tối đa 80/ngày, 10–15 thư/giờ, chỉ 09:00–17:00,
 *        chỉ cho người dùng còn hoạt động, quá 48 giờ chưa gửi thì tự huỷ.
 *   Đệm 60 lượt để trống: P0 tăng đột biến thì mượn đệm trước, hết đệm mới cắt P2.
 */

const LANES = Object.freeze({ P0: 0, P1: 1, P2: 2 });
const LANE_LABELS = ['P0 · Bảo mật', 'P1 · Thư mời', 'P2 · Gợi ý'];

// Hạn mức của gói gửi (Brevo Free = 300 người nhận/ngày). Gói trả phí thì đặt
// lại biến này; mọi trần bên dưới co giãn theo đúng tỉ lệ của kế hoạch.
const providerDailyLimit = () => Math.max(10, Number(process.env.EMAIL_PROVIDER_DAILY_LIMIT) || 300);

/** Tỉ lệ trên hạn mức gói: 60 / 100 / 80 / đệm 60 khi hạn mức là 300. */
const SHARE = Object.freeze({ p0Reserve: 0.2, p1: 1 / 3, p2: 0.8 / 3, buffer: 0.2 });

const limits = (provider = providerDailyLimit()) => ({
  provider,
  softCap: Math.round(provider * 0.8),
  p0Reserve: Math.round(provider * SHARE.p0Reserve),
  p1: Math.round(provider * SHARE.p1),
  p2: Math.round(provider * SHARE.p2),
  buffer: Math.round(provider * SHARE.buffer),
});

/**
 * Lộ trình tăng tải 4 tuần (đơn vị: tỉ lệ trên trần đầy đủ của làn).
 * Với hạn mức 300: tuần 1 = 60+50+0 = 110, tuần 2 = 170, tuần 3 = 210, tuần 4+ = 240.
 * Chỉ lên bậc khi 7 ngày qua sạch — xem `canAdvanceWarmup`.
 */
const WARMUP = Object.freeze({
  1: { p1: 0.5, p2: 0, activeDays: 30, label: 'Tuần 1 · Tắt P2, lọc sạch danh sách' },
  2: { p1: 0.7, p2: 0.5, activeDays: 14, label: 'Tuần 2 · Mở nhẹ P2 (người dùng 14 ngày)' },
  3: { p1: 0.9, p2: 0.75, activeDays: 30, label: 'Tuần 3 · Tăng dần' },
  4: { p1: 1, p2: 1, activeDays: 30, label: 'Tuần 4+ · Vận hành ổn định' },
});
const MAX_STAGE = 4;
const WARMUP_STAGE_DAYS = 7;

/** Nhịp gửi. P0 không có nhịp — gửi ngay. */
const PACING = Object.freeze({
  1: { perHour: 20, gapMinMs: 60_000, gapMaxMs: 90_000 },
  2: { perHour: 15, gapMinMs: 200_000, gapMaxMs: 300_000 },
  throttledGapMs: 120_000, // THROTTLED: 1 thư / 2 phút
});

/** Khung giờ gửi P2 (giờ Việt Nam), [start, end). */
const P2_WINDOW = Object.freeze({ startHour: 9, endHour: 17 });

/** Hạn sử dụng của thư P2 trong outbox. */
const P2_TTL_MS = 48 * 60 * 60 * 1000;

/** Thư mời: tối đa 1 thư mời + 1 thư nhắc, thư nhắc cách thư trước ít nhất 7 ngày. */
const INVITE_MAX_SENDS = 2;
const INVITE_RESEND_GAP_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

const BREAKER = Object.freeze({
  CLOSED: 'CLOSED',
  THROTTLED: 'THROTTLED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});
const SEVERITY = { CLOSED: 0, HALF_OPEN: 1, THROTTLED: 2, OPEN: 3 };

const HOUR = 60 * 60 * 1000;
const THRESHOLDS = Object.freeze({
  spam: { open: 1, openMs: 72 * HOUR }, // ≥ 1 báo cáo spam / 24h
  hardBounce: { throttle: 3, open: 6, throttleMs: 6 * HOUR, openMs: 24 * HOUR }, // / 24h
  // Deferred + soft bounce trong 1 giờ: cần ít nhất 5 sự kiện để tỉ lệ có nghĩa
  softBounce: { minCount: 5, throttleRate: 0.08, openRate: 0.15, throttleMs: 6 * HOUR, openMs: 24 * HOUR },
  smtp: { codes: [421, 451, 550], throttle: 2, open: 3, throttleMs: 6 * HOUR, openMs: 12 * HOUR },
  halfOpenProbe: 20, // số thư P1+P2 được gửi thăm dò
  halfOpenCleanMs: 24 * HOUR, // sạch 24h thì đóng lại
  warmupMaxHardBounceRate: 0.02,
});

// ─── Thời gian theo giờ Việt Nam ─────────────────────────────────────────────
// Việt Nam không có giờ mùa hè, nên cộng cố định 7 tiếng là đủ và không phụ
// thuộc múi giờ của container (Railway chạy UTC).
const VN_OFFSET_MS = 7 * HOUR;

const vnClock = (date = new Date()) => {
  const d = new Date(date.getTime() + VN_OFFSET_MS);
  const iso = d.toISOString();
  return {
    dateKey: iso.slice(0, 10), // YYYY-MM-DD
    hourKey: iso.slice(0, 13), // YYYY-MM-DDTHH
    hour: d.getUTCHours(),
    weekday: d.getUTCDay(), // 0 = Chủ nhật
  };
};

/** Ngày nghỉ của P1/P2 (mặc định Chủ nhật). Đặt EMAIL_COOLDOWN_WEEKDAYS= (rỗng) để tắt. */
const cooldownWeekdays = () => {
  const raw = process.env.EMAIL_COOLDOWN_WEEKDAYS;
  if (raw === undefined) return [0];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
};

/** Bậc warm-up ép bằng biến môi trường (vd EMAIL_WARMUP_STAGE=4 để tắt warm-up). */
const forcedStage = () => {
  const n = Number(process.env.EMAIL_WARMUP_STAGE);
  return Number.isInteger(n) && n >= 1 && n <= MAX_STAGE ? n : null;
};

const effectiveStage = (state) => forcedStage() || Math.min(MAX_STAGE, Math.max(1, state?.warmupStage || 1));

const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

/**
 * Trần ngày của từng làn ở trạng thái hiện tại.
 * Breaker THROTTLED: P1 giảm 50%, P2 tắt. OPEN: P1, P2 về 0. P0 không đổi.
 */
const laneCaps = (state, now = new Date()) => {
  const L = limits();
  const stage = WARMUP[effectiveStage(state)];
  const breaker = state?.breakerState || BREAKER.CLOSED;

  let p1 = Math.round(L.p1 * stage.p1);
  let p2 = Math.round(L.p2 * stage.p2);

  // P0 vượt phần giữ riêng thì ăn vào vùng đệm trước, hết đệm mới cắt P2
  const p0Over = Math.max(0, (state?.p0SentToday || 0) - L.p0Reserve - L.buffer);
  p2 = Math.max(0, p2 - p0Over);

  if (breaker === BREAKER.THROTTLED) {
    p1 = Math.floor(p1 / 2);
    p2 = 0;
  } else if (breaker === BREAKER.OPEN) {
    p1 = 0;
    p2 = 0;
  }

  const clock = vnClock(now);
  const cooldown = cooldownWeekdays().includes(clock.weekday);
  if (cooldown) {
    p1 = 0;
    p2 = 0;
  }

  return { p0: L.provider, p1, p2, cooldown, stage: effectiveStage(state), limits: L };
};

/**
 * Làn này có được gửi `units` người nhận ngay lúc này không?
 * Trả về `{ allowed, reason, cap, hourCap, gapMs }` — `cap`/`hourCap` dùng làm
 * điều kiện nguyên tử khi tăng bộ đếm, nên hai worker không thể cùng vượt trần.
 */
const evaluate = (state, lane, units = 1, now = new Date()) => {
  const caps = laneCaps(state, now);
  const total = state?.totalSentToday || 0;

  // Trần cứng của gói: chạm là Brevo từ chối, kể cả thư P0
  if (total + units > caps.limits.provider) {
    return { allowed: false, reason: `Đã dùng hết hạn mức ${caps.limits.provider} lượt/ngày của gói gửi.` };
  }

  if (lane === LANES.P0) return { allowed: true, cap: caps.limits.provider };

  const breaker = state?.breakerState || BREAKER.CLOSED;
  if (breaker === BREAKER.OPEN) {
    return { allowed: false, reason: `Circuit Breaker đang NGẮT: ${state?.lastTripReason || 'tín hiệu xấu'}.` };
  }
  if (caps.cooldown) {
    return { allowed: false, reason: 'Hôm nay là ngày nghỉ của thư mời và thư gợi ý.' };
  }

  const key = lane === LANES.P1 ? 'p1' : 'p2';
  const cap = caps[key];
  const sent = state?.[`${key}SentToday`] || 0;
  if (cap <= 0) {
    const why =
      breaker === BREAKER.THROTTLED
        ? 'Circuit Breaker đang GIẢM TỐC — tạm tắt thư gợi ý.'
        : `Bậc warm-up ${caps.stage} chưa mở làn này.`;
    return { allowed: false, reason: why };
  }
  if (sent + units > cap) {
    return { allowed: false, reason: `Làn ${LANE_LABELS[lane]} đã gửi đủ ${cap} lượt hôm nay.` };
  }

  if (lane === LANES.P2) {
    const { hour } = vnClock(now);
    if (hour < P2_WINDOW.startHour || hour >= P2_WINDOW.endHour) {
      return {
        allowed: false,
        reason: `Thư gợi ý chỉ gửi trong khung ${P2_WINDOW.startHour}:00–${P2_WINDOW.endHour}:00.`,
      };
    }
  }

  if (breaker === BREAKER.HALF_OPEN && (state?.probeSent || 0) + units > THRESHOLDS.halfOpenProbe) {
    return { allowed: false, reason: 'Đang gửi thăm dò sau sự cố — đã đủ số thư thăm dò, chờ kết quả.' };
  }

  const pace = PACING[lane];
  const sameHour = state?.hourKey === vnClock(now).hourKey;
  const hourSent = sameHour ? state?.[`${key}SentThisHour`] || 0 : 0;
  if (hourSent + units > pace.perHour) {
    return { allowed: false, reason: `Làn ${LANE_LABELS[lane]} đã gửi đủ ${pace.perHour} thư trong giờ này.` };
  }

  const nextAt = state?.[`${key}NextAt`];
  if (nextAt && new Date(nextAt) > now) {
    return { allowed: false, reason: 'Chưa tới nhịp gửi kế tiếp.', retryAt: new Date(nextAt) };
  }

  const gapMs =
    breaker === BREAKER.THROTTLED
      ? Math.max(PACING.throttledGapMs, pace.gapMinMs)
      : randomBetween(pace.gapMinMs, pace.gapMaxMs);

  return { allowed: true, cap, hourCap: pace.perHour, gapMs };
};

/**
 * Bước chuyển của breaker khi có tín hiệu xấu. Chỉ leo thang, không hạ: đang
 * OPEN mà gặp tín hiệu mức THROTTLED thì giữ OPEN. Đang HALF_OPEN (gửi thăm dò)
 * mà gặp bất kỳ tín hiệu xấu nào là quay lại OPEN.
 *
 * @returns {null | {state, resumeAt, reason}}
 */
const escalate = (current, target, durationMs, reason, now = new Date()) => {
  const cur = current?.breakerState || BREAKER.CLOSED;
  let next = target;
  if (cur === BREAKER.HALF_OPEN) next = BREAKER.OPEN;
  if (SEVERITY[next] < SEVERITY[cur]) return null;

  const resumeAt = new Date(now.getTime() + durationMs);
  const curResume = current?.resumeAt ? new Date(current.resumeAt) : null;
  // Cùng mức và lần ngắt hiện tại còn dài hơn thì không rút ngắn lại
  if (next === cur && curResume && curResume >= resumeAt) return null;

  return { state: next, resumeAt, reason };
};

/**
 * Chuyển trạng thái theo thời gian (không cần tín hiệu mới):
 *   OPEN      → HALF_OPEN khi hết thời gian nghỉ
 *   THROTTLED → CLOSED    khi hết thời gian giảm tốc
 *   HALF_OPEN → CLOSED    khi thăm dò sạch đủ 24h (tín hiệu xấu đã đẩy về OPEN rồi)
 */
const timeTransition = (state, now = new Date()) => {
  const cur = state?.breakerState || BREAKER.CLOSED;
  const resumeAt = state?.resumeAt ? new Date(state.resumeAt) : null;
  if (cur === BREAKER.OPEN && resumeAt && now >= resumeAt) return BREAKER.HALF_OPEN;
  if (cur === BREAKER.THROTTLED && resumeAt && now >= resumeAt) return BREAKER.CLOSED;
  if (cur === BREAKER.HALF_OPEN && state?.halfOpenSince) {
    if (now - new Date(state.halfOpenSince) >= THRESHOLDS.halfOpenCleanMs) return BREAKER.CLOSED;
  }
  return null;
};

/** Phán quyết từ số liệu tín hiệu. `counts` do governor đếm từ email_events. */
const judgeHardBounce = (count24h) => {
  const t = THRESHOLDS.hardBounce;
  if (count24h >= t.open) {
    return { target: BREAKER.OPEN, ms: t.openMs, reason: `hard bounce ${count24h} lượt / 24h (ngưỡng ${t.open})` };
  }
  if (count24h >= t.throttle) {
    return {
      target: BREAKER.THROTTLED,
      ms: t.throttleMs,
      reason: `hard bounce ${count24h} lượt / 24h (ngưỡng ${t.throttle})`,
    };
  }
  return null;
};

const judgeSoftBounce = (count1h, sent1h) => {
  const t = THRESHOLDS.softBounce;
  if (count1h < t.minCount) return null;
  const rate = count1h / Math.max(sent1h, 1);
  const pct = `${Math.round(rate * 100)}%`;
  if (rate > t.openRate) {
    return { target: BREAKER.OPEN, ms: t.openMs, reason: `deferred/soft bounce ${count1h} lượt (${pct}) trong 1 giờ` };
  }
  if (rate > t.throttleRate) {
    return {
      target: BREAKER.THROTTLED,
      ms: t.throttleMs,
      reason: `deferred/soft bounce ${count1h} lượt (${pct}) trong 1 giờ`,
    };
  }
  return null;
};

const judgeSmtpStreak = (streak, code) => {
  const t = THRESHOLDS.smtp;
  if (streak >= t.open) {
    return { target: BREAKER.OPEN, ms: t.openMs, reason: `${streak} lỗi SMTP liên tiếp (mã ${code})` };
  }
  if (streak >= t.throttle) {
    return { target: BREAKER.THROTTLED, ms: t.throttleMs, reason: `${streak} lỗi SMTP liên tiếp (mã ${code})` };
  }
  return null;
};

/** Lên bậc warm-up khi đã ở bậc hiện tại đủ 7 ngày và 7 ngày đó sạch. */
const canAdvanceWarmup = (state, stats7d, now = new Date()) => {
  if (forcedStage()) return false;
  const stage = state?.warmupStage || 1;
  if (stage >= MAX_STAGE) return false;
  if ((state?.breakerState || BREAKER.CLOSED) !== BREAKER.CLOSED) return false;
  const since = state?.warmupStageSince ? new Date(state.warmupStageSince) : null;
  if (!since || now - since < WARMUP_STAGE_DAYS * 24 * HOUR) return false;
  if ((stats7d.spam || 0) > 0) return false;
  const rate = (stats7d.hardBounce || 0) / Math.max(stats7d.sent || 0, 1);
  return rate < THRESHOLDS.warmupMaxHardBounceRate;
};

module.exports = {
  LANES,
  LANE_LABELS,
  BREAKER,
  WARMUP,
  MAX_STAGE,
  PACING,
  P2_WINDOW,
  P2_TTL_MS,
  INVITE_MAX_SENDS,
  INVITE_RESEND_GAP_MS,
  THRESHOLDS,
  limits,
  providerDailyLimit,
  vnClock,
  cooldownWeekdays,
  effectiveStage,
  laneCaps,
  evaluate,
  escalate,
  timeTransition,
  judgeHardBounce,
  judgeSoftBounce,
  judgeSmtpStreak,
  canAdvanceWarmup,
};
