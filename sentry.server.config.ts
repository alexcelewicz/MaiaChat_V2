// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Environment configuration
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || "development",

  // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === 'development',

  // Filter out known non-critical errors
  ignoreErrors: [
    // Network timeouts that are expected
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    // User-initiated cancellations
    "AbortError",
    // Rate limiting (handled by app)
    "Rate limit exceeded",
  ],

  // Enable beforeSend for additional filtering
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV === "development" && !process.env.SENTRY_DEBUG) {
      return null;
    }

    // Filter out specific error types
    const error = hint.originalException;
    if (error instanceof Error) {
      // Don't report 404 errors
      if (error.message.includes("404")) {
        return null;
      }
      // Don't report authentication errors (handled by app)
      if (error.message.includes("Unauthorized") || error.message.includes("401")) {
        return null;
      }
    }

    return event;
  },

  // Capture unhandled promise rejections
  integrations: [
    Sentry.captureConsoleIntegration({
      levels: ["error"],
    }),
  ],
});
