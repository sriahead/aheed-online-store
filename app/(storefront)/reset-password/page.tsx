import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

// #729 — the title now names the request's vendor, which only exists per request; and Prisma's
// @prisma/client/wasm can't load during next build's static prerendering (see /search).
export const dynamic = "force-dynamic";

/** #729 — was a hardcoded "Reset password — Aheed Food Centre", which rendered under every vendor. */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  return { title: `Reset password — ${profile?.name ?? "Aheed Food Centre"}` };
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Reset your password</h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
