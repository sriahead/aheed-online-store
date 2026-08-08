import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Check, X, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth-rbac";
import { getDevDiagnostics } from "@/lib/dev-diagnostics";

// Reads the session (requireRole) — must render per-request, never prerender.
export const dynamic = "force-dynamic";

export const metadata = { title: "Dev — Aheed Food Centre" };

function environmentName(host: string): string {
  if (host.includes("staging")) return "Staging";
  if (host.includes("localhost") || host.includes("127.0.0.1")) return "Local";
  return host ? "Production" : "Unknown";
}

const INTEGRATION_LABELS: Record<string, string> = {
  googleSignIn: "Google sign-in",
  storage: "Object storage (S3)",
  email: "Email (Resend)",
  cdn: "CDN base URL",
  betterAuthUrl: "BETTER_AUTH_URL",
};

export default async function DevPage() {
  const auth = await requireRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    // 403 — signed in but not an admin. Show a message, not the diagnostics.
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-primary">Administrators only</h1>
        <p className="mt-3 text-primary/70">
          This area is restricted to admin accounts. You&apos;re signed in, but your role
          doesn&apos;t have access.
        </p>
      </main>
    );
  }

  const host = (await headers()).get("host") ?? "";
  const diagnostics = getDevDiagnostics();
  const { user } = auth;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Developer diagnostics</h1>
      <p className="mb-8 text-sm text-primary/60">
        Admin-only. Non-secret environment info — never shows secret values.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Environment */}
        <section className="rounded-md border border-black/10 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Environment
          </h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-primary/70">Environment</dt>
              <dd className="font-semibold text-primary">{environmentName(host)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-primary/70">Host</dt>
              <dd className="font-mono text-primary">{host || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-primary/70">Deployed commit</dt>
              <dd className="font-mono text-primary">{diagnostics.commit ?? "— (local)"}</dd>
            </div>
          </dl>
        </section>

        {/* Session */}
        <section className="rounded-md border border-black/10 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Your session
          </h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-primary/70">Role</dt>
              <dd className="font-semibold text-primary">{user.role}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-primary/70">Email</dt>
              <dd className="text-primary">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-primary/70">User ID</dt>
              <dd className="truncate font-mono text-primary" title={user.id}>
                {user.id}
              </dd>
            </div>
          </dl>
        </section>

        {/* Integrations */}
        <section className="rounded-md border border-black/10 p-5 sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Integrations (configured for this environment)
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(diagnostics.integrations).map(([key, on]) => (
              <li key={key} className="flex items-center justify-between gap-4">
                <span className="text-primary/80">{INTEGRATION_LABELS[key] ?? key}</span>
                {on ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-primary">
                    <Check className="h-4 w-4 text-action" aria-hidden /> Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-danger">
                    <X className="h-4 w-4" aria-hidden /> Not set
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* KMS */}
        <section className="rounded-md border border-black/10 p-5 sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Knowledge Management System (internal docs)
          </h2>
          {diagnostics.kmsUrl ? (
            <a
              href={diagnostics.kmsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-action"
            >
              Open the KMS internal docs
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : (
            <p className="text-sm text-primary/60">
              KMS link pending setup — set <code className="font-mono">KMS_INTERNAL_URL</code> once
              the internal docs site has a DNS record and a Cloudflare Access gate (see{" "}
              <code className="font-mono">kms/site-internal/wrangler.toml</code>).
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
