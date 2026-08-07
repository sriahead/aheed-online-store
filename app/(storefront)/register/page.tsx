import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { getEnv } from "@/lib/config";

// getEnv() reads GOOGLE_CLIENT_ID from the Cloudflare request-scoped binding,
// which only exists at runtime (wrangler secrets aren't available at build
// time) — without this, Next statically prerenders the page and bakes in a
// build-time (always-false) value instead of checking it per request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Create account — Aheed Food Centre" };

export default function RegisterPage() {
  const env = getEnv();
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Create account</h1>
      <RegisterForm />
      {googleEnabled && (
        <>
          <p className="my-4 text-center text-sm text-black/50">or</p>
          <GoogleSignInButton />
        </>
      )}
    </main>
  );
}
