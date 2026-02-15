import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server-side Sentry initialization
    await import("./sentry.server.config");
    await import("./src/lib/scheduler/boot");
    await import("./src/lib/background/boot");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Edge runtime Sentry initialization
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
