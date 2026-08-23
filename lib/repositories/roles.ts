// Type-only: a value import of "@prisma/client/wasm" is unresolvable under vitest
// (see tests/orders.test.ts), and this file needs nothing from it at runtime.
import type { Prisma } from "@prisma/client/wasm";
import type { getPrisma, getPrismaWs } from "@/lib/db";
import type { VendorRole } from "@/lib/auth-rbac";

/**
 * Team & role management (P6.7) — the ONLY DB access for vendor memberships and
 * their audit trail. Pages and Server Actions reach these through
 * `lib/roles-service.ts`'s request-scoped wrapper (ADR-004 slice-2
 * no-direct-Prisma guard).
 *
 * THIS FILE WAS THE HARDEST CASE IN #252 and is the reason the fix was a split
 * rather than a move: both of its exports used to resolve the vendor from
 * request context themselves and one of them performed its own
 * `requireVendorRole("ADMIN")` session check, so the module had no pure
 * functions at all and nothing here could be exercised from a plain `tsx`
 * script. The session check now runs in `lib/roles-service.ts`, which passes
 * the resulting actor in as DATA — that keeps the hierarchy rules below (who
 * may grant ADMIN, who may touch a platform admin, what counts as a
 * self-demotion) testable without a live Workers request, which is exactly
 * what they need most, since they are authorization logic.
 *
 * EVERY EXPORTED FUNCTION takes its client(s) and `vendorId` as EXPLICIT
 * arguments and reads no request context — no `getCurrentVendorId()`, no
 * `headers()`, no `getAuth()`. `tests/repository-purity.test.ts` enforces it.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export type VendorRoleAction = "STAFF" | "ADMIN" | null; // null means demote to USER

/**
 * The caller, reduced to the two facts the hierarchy rules actually depend on.
 * `via` records HOW the caller's admin authority was established, because a
 * platform admin may do things a store admin may not.
 */
export interface RoleActor {
  id: string;
  via: "platform-admin" | VendorRole;
}

export async function listVendorTeam(prisma: Db, vendorId: string) {
  const members = await prisma.vendorMembership.findMany({
    where: { vendorId },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.userId,
    name: m.user.name,
    email: m.user.email,
    platformRole: m.user.role,
    vendorRole: m.role,
    createdAt: m.createdAt,
  }));
}

/**
 * Grant, change or revoke a vendor role, with an audit row, as one transaction.
 *
 * The caller is responsible for having established that `actor` holds ADMIN
 * authority at `vendorId` — `lib/roles-service.ts` does that with
 * `requireVendorRole("ADMIN")` before calling here. Everything below is a
 * hierarchy rule that operates on the actor as data.
 */
export async function applyVendorRole(
  prisma: Db,
  prismaWs: DbWs,
  vendorId: string,
  actor: RoleActor,
  targetEmail: string,
  newRole: VendorRoleAction,
): Promise<void> {
  // Validate hierarchy rules
  if (newRole === "ADMIN" && actor.via !== "platform-admin") {
    throw new Error("Forbidden: Only a platform-admin can grant the Store Admin role.");
  }

  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!targetUser) {
    throw new Error("User not found with that email address.");
  }

  // Look up old role
  const existingMembership = await prisma.vendorMembership.findUnique({
    where: { userId_vendorId: { userId: targetUser.id, vendorId } },
  });
  const oldRole = existingMembership?.role ?? null;

  if (oldRole === newRole) {
    throw new Error(`User is already assigned the role: ${newRole ?? "USER"}`);
  }

  // Prevent Store Admin from modifying a platform-admin's privileges
  if (targetUser.role === "ADMIN" && actor.via !== "platform-admin") {
    throw new Error("Forbidden: Cannot modify a platform-admin's privileges.");
  }

  const isSelfDemotion = targetUser.id === actor.id && newRole !== "ADMIN" && actor.via === "ADMIN";

  // Serializable so the last-admin count check and the write it guards are read+acted-on
  // as one unit — two concurrent self-demotions both reading "2 admins left" and both
  // proceeding would leave the vendor with zero. Postgres aborts the loser with a
  // serialization failure instead, matching every other last-one-standing guard in this
  // codebase (stock in P3b, points in P5a, discount usage in P5b), which use an atomic
  // compare-and-set `updateMany` instead — not available here since the guard depends on
  // an aggregate over other rows, not a counter column on the row being written.
  await prismaWs.$transaction(
    async (tx) => {
      if (isSelfDemotion) {
        const adminCount = await tx.vendorMembership.count({
          where: { vendorId, role: "ADMIN" },
        });
        if (adminCount <= 1) {
          throw new Error("Forbidden: Cannot demote the last remaining Store Admin.");
        }
      }

      if (newRole) {
        await tx.vendorMembership.upsert({
          where: { userId_vendorId: { userId: targetUser.id, vendorId } },
          create: { userId: targetUser.id, vendorId, role: newRole },
          update: { role: newRole },
        });
      } else {
        // Demote completely
        await tx.vendorMembership.deleteMany({
          where: { userId: targetUser.id, vendorId },
        });
      }

      // Audit log
      await tx.vendorRoleAuditLog.create({
        data: {
          vendorId,
          userId: targetUser.id,
          actorId: actor.id,
          oldRole,
          newRole,
        },
      });
    },
    { isolationLevel: "Serializable" satisfies Prisma.TransactionIsolationLevel },
  );
}
