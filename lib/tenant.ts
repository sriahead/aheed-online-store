import { headers } from "next/headers";
import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { splitHostPort } from "@/lib/auth-origin";

/**
 * Resolve the current request's vendor id from the request host (ADR-004 slice 3b).
 *
 * MEMOIZED PER REQUEST with React `cache()` (#670 part 2, #682). This is
 * request-scoped de-duplication, not a cross-request cache: no Prisma client and
 * no vendor id survives the request, so the Workers I/O rule ("construct fresh
 * on every call, never cache across requests") is not engaged. It is the same
 * mechanism `getCurrentVendorProfile` in `lib/vendor-service.ts` and
 * `getPrisma`/`getPrismaWs` in `lib/db.ts` already use.
 *
 * This docstring previously said per-request `cache()` was "intentionally
 * omitted for testability/simplicity", on the reasoning that repositories
 * memoize the result per instance. They do — but PER INSTANCE, and roughly
 * twenty service factories each carry their own
 * `vendorIdPromise ??= getCurrentVendorId()`. So one render of a page touching
 * four services resolved the same immutable value four times. #503 measured the
 * economics that makes this matter: every query on the path runs in under 2 ms
 * while a single Neon round-trip costs about 69 ms, so the latency is
 * round-trip COUNT, not query cost.
 *
 * Exact `VendorDomain.host` match wins. Transition safety: if no host matches AND there is
 * exactly one active vendor, resolve to it (so a single-vendor deployment keeps working
 * before its `VendorDomain` rows are seeded). With 0 or 2+ vendors and no match → null.
 */
export const getCurrentVendorIdOrNull = cache(async (): Promise<string | null> => {
  const rawHost = (await headers()).get("host") ?? "";
  const host = splitHostPort(rawHost).hostname;
  const prisma = getPrisma();

  if (host) {
    // Local development/preview exception
    if (host === "localhost" || host === "127.0.0.1") {
      const defaultVendor = await prisma.vendor.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (defaultVendor) return defaultVendor.id;
    }

    const domain = await prisma.vendorDomain.findUnique({
      where: { host },
      select: { vendorId: true },
    });
    if (domain) return domain.vendorId;

    /**
     * #514 — fall back to the host WITH its port, for local preview only.
     *
     * The lookup above compares the port-stripped hostname, which is right for
     * every real deployment: `staging.nocaped.com` and `nocaped.com` never carry
     * a port, so stripping it is what makes the match work. But under
     * `npm run preview` a second vendor is reached at `srimart.localhost:8787`,
     * and seeding that literal string — the natural thing to do, since it is
     * exactly what the browser sends as `Host` — could never match. The request
     * fell through to the "no match, 2+ vendors" branch and redirected to
     * `/coming-soon`, with nothing to indicate why.
     *
     * Guarded on `rawHost !== host` so this costs a real deployment nothing: a
     * host with no port takes exactly the one query it always did. Second, not
     * first, so the existing port-stripped convention keeps winning wherever
     * both rows somehow exist.
     */
    const rawHostLower = rawHost.toLowerCase();
    if (rawHostLower !== host) {
      const portedDomain = await prisma.vendorDomain.findUnique({
        where: { host: rawHostLower },
        select: { vendorId: true },
      });
      if (portedDomain) return portedDomain.vendorId;
    }
  }

  // No host match — fall back only when there is a single active vendor.
  const activeVendors = await prisma.vendor.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 2,
  });
  return activeVendors.length === 1 ? activeVendors[0].id : null;
});

/**
 * Non-null vendor id for data access (repositories, `requireVendorRole`). Throws if the
 * host can't be resolved — the storefront layout redirects such hosts to `/coming-soon`
 * before any repository runs, so reaching the throw is a defensive last resort.
 */
export async function getCurrentVendorId(): Promise<string> {
  const vendorId = await getCurrentVendorIdOrNull();
  if (!vendorId) throw new Error("No vendor resolved for the current request host");
  return vendorId;
}

/**
 * The default vendor's canonical host — the oldest active vendor's `isCanonical`
 * `VendorDomain` — for the Coming Soon page's "go to a valid store" link. Null if none set.
 */
export async function getDefaultVendorCanonicalHost(): Promise<string | null> {
  const prisma = getPrisma();
  const vendor = await prisma.vendor.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { domains: { where: { isCanonical: true }, select: { host: true }, take: 1 } },
  });
  return vendor?.domains[0]?.host ?? null;
}
