import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — 404",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center bg-surface-muted text-primary">
      <div className="rounded-full bg-primary/10 p-4 text-primary">
        <span className="text-4xl font-bold">404</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="max-w-md text-sm text-primary/70">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Return to store →
      </Link>
    </main>
  );
}
