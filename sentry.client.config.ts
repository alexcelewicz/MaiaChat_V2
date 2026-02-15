// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Enable replay in production with low sample rate
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.01 : 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out known non-critical errors
  ignoreErrors: [
    // Network errors
    "Failed to fetch",
    "NetworkError",
    "Load failed",
    // Browser extensions
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // User cancellation
    "AbortError",
    "The user aborted a request",
  ],

  // Don't report errors from these URLs
  denyUrls: [
    // Chrome extensions
    /extensions\//i,
    /^chrome:\/\//i,
    // Firefox extensions
    /^moz-extension:\/\//i,
    // Safari extensions
    /^safari-extension:\/\//i,
  ],

  // Environment configuration
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || "development",

  // Enable beforeSend for additional filtering
  beforeSend(event, hint) {
    // Don't send events in development unless debugging
    if (process.env.NODE_ENV === "development" && !process.env.SENTRY_DEBUG) {
      return null;
    }

    // Add additional context
    if (event.exception) {
      console.error("Sentry captured exception:", hint.originalException);
    }

    return event;
  },
});
