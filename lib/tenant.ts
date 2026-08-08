import { getPrisma } from "@/lib/db";

/**
 * Resolve the current request's vendor id — the multi-tenancy resolution seam
 * (ADR-004). Constructed fresh per call; the result must NOT be cached across
 * requests (Workers I/O rule, same as lib/db.ts's getPrisma()).
 *
 * INTERIM (slice 2): single-tenant — returns the sole ACTIVE vendor. Slice 3
 * replaces ONLY this function's body with host→tenant resolution (subdomain /
 * custom domain); the repositories that call it do not change.
 */
export async function getCurrentVendorId(): Promise<string> {
  const prisma = getPrisma();
  const vendor = await prisma.vendor.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return vendor.id;
}
