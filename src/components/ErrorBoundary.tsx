"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCcw, Home, Bug } from "lucide-react";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error, {
      tags: {
        errorBoundary: "global",
        digest: error.digest,
      },
      extra: {
        componentStack: error.stack,
      },
    });

    // Also log to console for development
    console.error("Error caught by boundary:", error);
  }, [error]);

  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
          <CardDescription className="text-base">
            We apologize for the inconvenience. An unexpected error has occurred.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isDevelopment && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Bug className="h-4 w-4" />
                <span className="font-medium">Debug Information</span>
              </div>
              <p className="font-mono text-xs text-destructive break-all">
                {error.message}
              </p>
              {error.digest && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}

          {!isDevelopment && error.digest && (
            <p className="text-center text-sm text-muted-foreground">
              Error reference: <code className="bg-muted px-1 rounded">{error.digest}</code>
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button onClick={reset} className="w-full" size="lg">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
            className="w-full"
          >
            <Home className="mr-2 h-4 w-4" />
            Return Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
