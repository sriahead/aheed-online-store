/**
 * Names of request headers this app sets for itself (P8.5f).
 *
 * Lives in `lib/` rather than in `proxy.ts` so a Server Component can import the
 * name without pulling `next/server` — and the proxy module itself — into the
 * render path. `proxy.ts` writes it; `components/layout/Header.tsx` reads it.
 */

/**
 * The request's own pathname, set by `proxy.ts`.
 *
 * Exists because a layout cannot see which page it wraps, and `Header` — rendered
 * once by the storefront layout — must differ on `/` from every other route.
 * Internal only: it is set on the REQUEST headers (`NextResponse.next({ request:
 * { headers } })`), never on the response, so it is not visible to the browser.
 */
export const PATHNAME_HEADER = "x-pathname";
