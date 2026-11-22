const axios = require('axios');

/**
 * Báo cho người vận hành khi Circuit Breaker ngắt hoặc lô import bị dừng.
 *
 * KHÔNG báo bằng email: lúc này chính đường gửi mail đang có vấn đề, và mỗi thư
 * báo động lại tốn thêm một lượt quota. Kênh nào đặt biến môi trường thì gửi
 * kênh đó (Slack, Telegram); không đặt gì thì vẫn còn log và Sentry.
 */
const notifyOps = async (text) => {
  console.error(`[EmailAlert] ${text}`);

  try {
    if (process.env.SENTRY_DSN) {
      require('@sentry/node').captureMessage(`[EmailAlert] ${text}`, 'warning');
    }
  } catch {
    /* Sentry không có cũng không sao */
  }

  const jobs = [];
  const slack = String(process.env.EMAIL_ALERT_SLACK_WEBHOOK || '').trim();
  if (slack) {
    jobs.push(axios.post(slack, { text: `:rotating_light: ${text}` }, { timeout: 5000 }));
  }

  const tgToken = String(process.env.EMAIL_ALERT_TELEGRAM_BOT_TOKEN || '').trim();
  const tgChat = String(process.env.EMAIL_ALERT_TELEGRAM_CHAT_ID || '').trim();
  if (tgToken && tgChat) {
    jobs.push(
      axios.post(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        { chat_id: tgChat, text: `🚨 ${text}` },
        { timeout: 5000 },
      ),
    );
  }

  const results = await Promise.allSettled(jobs);
  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('[EmailAlert] Không gửi được cảnh báo:', r.reason?.message));
};

module.exports = { notifyOps };
