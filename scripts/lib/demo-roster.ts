/**
 * The demo login roster, as data only (#1356). Kept free of imports so that
 * scripts/lib/neon-migration-plan.ts and scripts/grant-role.ts can recognise a demo account without
 * loading Better Auth or Prisma; scripts/demo-accounts.ts re-exports it and does the writing.
 *
 * The roster moved from `demo-*@example.com` to `demo-*@merqify.com` on 2026-10-31 so mail to a demo
 * account can be forwarded to the owner's inbox (Cloudflare Email Routing, env-setup.md "Demo mail
 * forwarding"). The `@example.com` form is the LEGACY address: `demo:accounts add` renames it in
 * place and `remove` deletes both forms.
 */

// Platform role = User.role (platform ADMIN transcends vendors); vendor role = a
// VendorMembership at the current vendor (ADR-004 slice 3a). A demo account can be both.
export type PlatformRole = "ADMIN" | "CUSTOMER";
export type VendorRole = "STAFF" | "ADMIN";

export interface DemoAccount {
  email: string;
  name: string;
  platformRole: PlatformRole;
  vendorRole?: VendorRole;
  /** Which vendor `vendorRole` attaches to. Omitted = the first ACTIVE vendor (existing
   *  default). Set this to reach a vendor other than the platform's first one — e.g. a
   *  second vendor's admin, needed to prove a cross-vendor write is actually refused
   *  rather than merely untested in the reverse direction (#141). */
  vendorSlug?: string;
}

/** Fixed, code-defined roster. demo-platform-admin is the ONLY platform admin; demo-admin
 *  and demo-store-admin are store admins (vendor ADMIN only); demo-staff is a normal user
 *  with a vendor STAFF membership (not a platform staffer); demo-customer is a plain
 *  shopper; demo-srimart-admin is a store admin on the platform's SECOND vendor (SriMart,
 *  not the default first-active one).
 *
 *  #1319 — demo-admin was a platform admin until 2026-10-28; it is now a store admin only,
 *  and demo-platform-admin holds the platform role. `add` rewrites User.role on every run,
 *  so re-running it demotes an existing demo-admin (its Aheed ADMIN membership is kept).
 *  A platform admin needs no membership: requireVendorRole() admits it at every store.
 *
 *  demo-store-admin exists because a platform admin CANNOT stand in for a store admin:
 *  requireVendorRole() returns early with `via: "platform-admin"` for anyone whose
 *  User.role is ADMIN (lib/auth-rbac.ts). The role-hierarchy guards in
 *  lib/repositories/roles.ts — only a platform admin may grant ADMIN, a store admin may
 *  not touch a platform admin's privileges, and the self-lockout check — fire only when
 *  `via === "ADMIN"`. Added for P6.7's validation walk (#190), before demo-admin was
 *  demoted; it now does the same job as demo-admin and is kept with the roster.
 *
 *  demo-srimart-admin exists because every other vendor-role account attaches to the
 *  same (first ACTIVE) vendor, so no cross-vendor write attempt could ever be tested in
 *  both directions — only "vendor A admin tries to redirect a write to vendor B" was
 *  reachable, never the reverse. Added for P5a's R56 reverse-direction gap (#141). */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "demo-admin@merqify.com",
    name: "Demo Admin",
    platformRole: "CUSTOMER",
    vendorRole: "ADMIN",
  },
  {
    email: "demo-platform-admin@merqify.com",
    name: "Demo Platform Admin",
    platformRole: "ADMIN",
  },
  {
    email: "demo-staff@merqify.com",
    name: "Demo Staff",
    platformRole: "CUSTOMER",
    vendorRole: "STAFF",
  },
  { email: "demo-customer@merqify.com", name: "Demo Customer", platformRole: "CUSTOMER" },
  {
    email: "demo-store-admin@merqify.com",
    name: "Demo Store Admin",
    platformRole: "CUSTOMER",
    vendorRole: "ADMIN",
  },
  {
    email: "demo-srimart-admin@merqify.com",
    name: "Demo SriMart Admin",
    platformRole: "CUSTOMER",
    vendorRole: "ADMIN",
    vendorSlug: "srimart",
  },
];

/** The pre-#1356 address of a roster account: same local part, `@example.com`. */
export function legacyDemoEmail(email: string): string {
  return email.replace(/@merqify\.com$/, "@example.com");
}

export const DEMO_EMAILS: readonly string[] = DEMO_ACCOUNTS.map((a) => a.email);
export const LEGACY_DEMO_EMAILS: readonly string[] = DEMO_EMAILS.map(legacyDemoEmail);
