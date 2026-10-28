/**
 * Where a user lands after signing in (#1319). Pure: no imports, so the routing rule is testable
 * without a request. `app/(storefront)/signed-in/page.tsx` resolves the access level with the same
 * `requireVendorRole` gate every staff page uses, then redirects to `landingPath(...)`.
 */

export type LandingAccess = "platform-admin" | "store" | "shopper";

const DEFAULT_LANDING: Record<LandingAccess, string> = {
  "platform-admin": "/staff/platform",
  store: "/staff",
  shopper: "/account",
};

/**
 * A `next` target is honoured only when it is a same-origin absolute path. `//host` and `/\host`
 * are protocol-relative to a browser, so both are refused, as is anything carrying a control
 * character (a newline could split a header).
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  if (raw[1] === "/" || raw[1] === "\\") return null;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  return raw;
}

export function landingPath(access: LandingAccess, next?: string | null): string {
  return safeNextPath(next) ?? DEFAULT_LANDING[access];
}
