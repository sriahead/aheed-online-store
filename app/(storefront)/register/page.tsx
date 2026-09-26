import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { getEnv } from "@/lib/config";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

// getEnv() reads GOOGLE_CLIENT_ID from the Cloudflare request-scoped binding,
// which only exists at runtime (wrangler secrets aren't available at build
// time) — without this, Next statically prerenders the page and bakes in a
// build-time (always-false) value instead of checking it per request.
export const dynamic = "force-dynamic";

/** #729 — was a hardcoded "Create account — Aheed Food Centre", which rendered under every vendor. */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  return { title: `Create account — ${profile?.name ?? "Aheed Food Centre"}` };
}

export default function RegisterPage() {
  const env = getEnv();
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Create account</h1>
      <RegisterForm />
      {googleEnabled && (
        <>
          <p className="my-4 text-center text-sm text-black/60">or</p>
          <GoogleSignInButton />
        </>
      )}
    </main>
  );
}
