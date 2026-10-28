import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { landingPath, type LandingAccess } from "@/lib/auth-landing";

// Reads the session and the host's store — must run per request.
export const dynamic = "force-dynamic";

/**
 * Post-sign-in landing (#1319). The login form and Google sign-in both come here, and the user is
 * sent to the home for their role. It uses the same `requireVendorRole` gate the staff panel uses, so
 * "staff of this store" means exactly what the panel will admit:
 * - a platform admin goes to `/staff/platform`;
 * - staff or a store admin of the store this host serves go to `/staff`;
 * - anyone else signed in goes to `/account`.
 *
 * A same-origin `next` wins (`lib/auth-landing.ts` refuses anything off-site). A route handler, not a
 * page: it only ever redirects (307), so there is no page to render a container for.
 */
export async function GET(request: Request) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok && auth.status === 401) redirect("/login");

  const access: LandingAccess = !auth.ok
    ? "shopper"
    : auth.via === "platform-admin"
      ? "platform-admin"
      : "store";

  redirect(landingPath(access, new URL(request.url).searchParams.get("next")));
}
