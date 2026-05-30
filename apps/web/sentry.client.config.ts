import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Lower sample rate in production to reduce noise/cost
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  debug: false,

  // In dev: disable replays entirely (beforeSend already drops error events)
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0,

  environment: process.env.NODE_ENV,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend(event) {
    // Drop events from local development to avoid polluting Sentry
    if (process.env.NODE_ENV === "development") return null;
    return event;
  },
});
