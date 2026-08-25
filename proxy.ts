import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PATHNAME_HEADER } from "@/lib/request-headers";

/**
 * Request-scoped routing context (P8.5f).
 *
 * The ONLY thing this file does is annotate the request with its own pathname so
 * a Server Component can read it. It exists because **a layout cannot see which
 * page it wraps**: `components/layout/Header.tsx` is rendered once by
 * `app/(storefront)/layout.tsx` for every storefront route, but must render the
 * postcode checker on `/` and the search box + Shop List everywhere else.
 *
 * Chosen over splitting the storefront into `(landing)`/`(shop)` route groups so
 * each could own a layout — that has zero runtime cost but moves ~20 page
 * directories, and a mis-move silently changes a URL.
 *
 * ## Three things that are easy to get wrong here
 *
 * 1. **This is Next 16.** `middleware.ts` is deprecated and renamed to `proxy.ts`;
 *    the file must export a single function, default or named `proxy`.
 * 2. **Request headers go inside `request`.** `NextResponse.next({ request: {
 *    headers } })` passes them upstream to the app. The doc calls out the
 *    lookalike `NextResponse.next({ headers })` explicitly — that sends them to
 *    the CLIENT, which would make this a disclosure bug rather than a routing one.
 * 3. **Proxy defaults to the Node.js runtime in 16 and the `runtime` segment
 *    option is forbidden** — setting it throws. So there is deliberately no
 *    `export const runtime` below; the default suits this Worker's
 *    `nodejs_compat`.
 *
 * Deliberately NOT here: auth, tenant resolution and redirects. `lib/tenant.ts`
 * resolves the vendor from `Host` inside the request where Prisma is reachable,
 * and the storefront layout owns the `/coming-soon` redirect. Moving either into
 * the proxy would put a security decision in a layer that cannot query the
 * database. Keep this file thin.
 */

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  /*
   * Without a matcher, Proxy runs on EVERY request including `_next/static`,
   * `_next/image` and everything in `public/` — pure overhead here, since none of
   * those render a Header. Negative lookahead per the Next 16 docs' own example.
   *
   * `api` is excluded too: route handlers never render the Header, and the
   * campaign-image and Stripe-webhook routes have no use for a pathname hint.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
