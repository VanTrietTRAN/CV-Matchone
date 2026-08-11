// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://50734e208e8c2f6e106c88c4cc2d67e7@o4511777183498240.ingest.us.sentry.io/4511777189330944",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Production lấy mẫu 10% để không đốt quota Sentry; dev giữ 100% cho dễ debug.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Session Replay tốn quota nhất — production chỉ ghi 2% phiên bình thường.
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.02 : 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
