import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getPrisma } from "./db";
import { getCurrentVendorId } from "./tenant";

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

/** Per-vendor role (ADR-004 slice 3a) — mirrors the Prisma `VendorRole` enum. */
export type VendorRole = "STAFF" | "ADMIN";

export type RbacResult =
  | { ok: true; user: { id: string; email: string; name: string; role: Role } }
  | { ok: false; status: 401 | 403; reason: "unauthenticated" | "forbidden" };

/**
 * Gate a route handler / Server Action to one or more roles. Never a silent
 * pass-through: no session -> 401, wrong role -> 403, both returned as data
 * (not thrown) so callers decide how to respond.
 */
export async function requireRole(...allowed: Role[]): Promise<RbacResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  const role = ((session.user as { role?: Role }).role ?? "CUSTOMER") as Role;
  if (!allowed.includes(role)) {
    return { ok: false, status: 403, reason: "forbidden" };
  }

  return {
    ok: true,
    user: { id: session.user.id, email: session.user.email, name: session.user.name, role },
  };
}

export type VendorRbacResult =
  | {
      ok: true;
      user: { id: string; email: string; name: string };
      vendorId: string;
      via: "platform-admin" | VendorRole;
    }
  | { ok: false; status: 401 | 403; reason: "unauthenticated" | "forbidden" };

/**
 * Gate a route/action to per-vendor staff/admin (ADR-004 slice 3a). Platform ADMIN
 * (`User.role === "ADMIN"`) transcends vendors and is always allowed; otherwise the user
 * must hold a `VendorMembership` for the CURRENT vendor (resolved via getCurrentVendorId())
 * whose role is in `allowed`. Returned as data (not thrown), like requireRole().
 */
export async function requireVendorRole(...allowed: VendorRole[]): Promise<VendorRbacResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  const user = { id: session.user.id, email: session.user.email, name: session.user.name };
  const platformRole = ((session.user as { role?: Role }).role ?? "CUSTOMER") as Role;
  const vendorId = await getCurrentVendorId();

  // Platform admin transcends all vendors.
  if (platformRole === "ADMIN") {
    return { ok: true, user, vendorId, via: "platform-admin" };
  }

  const membership = await getPrisma().vendorMembership.findUnique({
    where: { userId_vendorId: { userId: user.id, vendorId } },
    select: { role: true },
  });
  if (membership && allowed.includes(membership.role)) {
    return { ok: true, user, vendorId, via: membership.role };
  }
  return { ok: false, status: 403, reason: "forbidden" };
}
