import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { requireVendorRole } from "@/lib/auth-rbac";
import { applyVendorRole, listVendorTeam, type VendorRoleAction } from "@/lib/repositories/roles";

/**
 * Request-scoped wrapper around `lib/repositories/roles.ts` (#252) — resolves a
 * live Prisma client, the current vendor and the acting user's authority, none
 * of which exist without a real Workers request.
 *
 * This file is where #252's rule was most load-bearing.
 * `lib/repositories/roles.ts` had no pure functions at all: both of its exports
 * resolved the vendor themselves and one performed its own session check, so
 * the hierarchy rules it enforces — who may grant ADMIN, who may modify a
 * platform admin, whether the last remaining Store Admin may demote themselves
 * — could not be exercised from a plain `tsx` script. The session check lives
 * here now, and the actor it produces is passed to the repository as data, so
 * those rules stay testable.
 *
 * Constructed fresh per call, never cached across requests.
 */
export async function getVendorTeam() {
  return listVendorTeam(getPrisma(), await getCurrentVendorId());
}

export async function setVendorRole(targetEmail: string, newRole: VendorRoleAction) {
  const vendorId = await getCurrentVendorId();
  const auth = await requireVendorRole("ADMIN");

  if (!auth.ok) {
    throw new Error("Unauthorized");
  }

  return applyVendorRole(
    getPrisma(),
    getPrismaWs(),
    vendorId,
    { id: auth.user.id, via: auth.via },
    targetEmail,
    newRole,
  );
}
