import { LoginForm } from "@/features/auth/components/LoginForm";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { getEnv } from "@/lib/config";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { PageContainer } from "@/components/layout/PageContainer";

// getEnv() reads GOOGLE_CLIENT_ID from the Cloudflare request-scoped binding,
// which only exists at runtime (wrangler secrets aren't available at build
// time) — without this, Next statically prerenders the page and bakes in a
// build-time (always-false) value instead of checking it per request.
export const dynamic = "force-dynamic";

/** #729 — was a hardcoded "Sign in — Aheed Food Centre", which rendered under every vendor. */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  return { title: `Sign in — ${profile?.name ?? "Aheed Food Centre"}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const env = getEnv();
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  // #1319 — forwarded to /signed-in, which accepts it only as a same-origin path.
  const { next: rawNext } = await searchParams;
  const next = typeof rawNext === "string" && rawNext !== "" ? rawNext : undefined;

  return (
    <PageContainer width="narrow">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold text-primary">Sign in</h1>
        <LoginForm next={next} />
        {googleEnabled && (
          <>
            <p className="my-4 text-center text-sm text-black/60">or</p>
            <GoogleSignInButton next={next} />
          </>
        )}
        <p className="mt-8 text-center text-sm text-black/70">
          Don&apos;t have an account?{" "}
          <a href="/register" className="font-medium text-primary hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </PageContainer>
  );
}
