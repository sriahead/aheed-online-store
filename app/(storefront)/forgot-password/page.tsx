import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { PageContainer } from "@/components/layout/PageContainer";

// #729 — the title now names the request's vendor, which only exists per request; and Prisma's
// @prisma/client/wasm can't load during next build's static prerendering (see /search).
export const dynamic = "force-dynamic";

/** #729 — was a hardcoded "Forgot password — Aheed Food Centre", which rendered under every vendor. */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  return { title: `Forgot password — ${profile?.name ?? "Aheed Food Centre"}` };
}

export default function ForgotPasswordPage() {
  return (
    <PageContainer width="narrow">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold text-primary">Forgot your password?</h1>
        <ForgotPasswordForm />
      </div>
    </PageContainer>
  );
}
