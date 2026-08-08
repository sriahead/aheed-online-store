import type { Metadata } from "next";
import { getDefaultVendorCanonicalHost } from "@/lib/tenant";

// Reads the default vendor's canonical host from the DB → dynamic. Lives OUTSIDE the
// (storefront) route group so it is not itself tenant-gated (ADR-004 slice 3b).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coming soon",
  robots: { index: false, follow: false },
};

export default async function ComingSoonPage() {
  const host = await getDefaultVendorCanonicalHost();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">Coming soon</h1>
      <p className="max-w-md text-gray-600">
        There&apos;s no store at this address yet. If you were looking for a shop, it may not be set
        up on this domain.
      </p>
      {host ? (
        <a
          href={`https://${host}`}
          className="mt-2 inline-block rounded-md border border-gray-300 px-4 py-2 font-medium underline-offset-4 hover:underline"
        >
          Visit our store →
        </a>
      ) : null}
    </main>
  );
}
