import { headers } from "next/headers";
import { getAuth } from "./auth";

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

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
