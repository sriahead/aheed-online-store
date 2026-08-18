import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDataRightsRepository } from "@/lib/data-rights-service";

// Reads the session and the viewer's own data — must run per request.
export const dynamic = "force-dynamic";

/**
 * Art. 15 access — download everything this vendor holds about you (P7b, #216).
 *
 * A route handler rather than a Server Action because an action cannot cleanly
 * hand the browser a file; this needs a real response with
 * `Content-Disposition: attachment`.
 *
 * Vendor-scoped in the repository, so a shopper on Aheed's host downloads
 * Aheed's data only — the same rule as P4a's order history and P3a's cart.
 *
 * The response is deliberately `no-store`: it is a per-user document served
 * from a host sitting behind Cloudflare's edge cache, and there is no version
 * of this that should ever be reused for a second request.
 */
export async function GET() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    // next/navigation's redirect() rather than NextResponse.redirect(), which
    // needs an absolute URL — the `origin` header is absent on a plain GET
    // navigation, so building one here would depend on a header that often
    // isn't there.
    redirect("/login");
  }

  const userId = (session.user as { id: string }).id;
  const data = await getDataRightsRepository().exportForCurrentVendor(userId);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="personal-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
