"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Caught by global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center bg-surface-muted text-primary">
          <div className="rounded-full bg-red-100 p-4 text-red-600">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="max-w-md text-sm text-primary/70">
            We encountered a critical error. Please try again or contact support if the problem
            persists.
          </p>
          <button
            onClick={() => reset()}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
