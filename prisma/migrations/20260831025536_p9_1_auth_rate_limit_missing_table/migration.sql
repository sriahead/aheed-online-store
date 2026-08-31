-- #482 — PR #461 (#431, P9.1 auth rate limiting) added the AuthenticationAttempt
-- model to prisma/schema.prisma but never generated a migration for it. The table
-- has never existed in any environment that runs `prisma migrate deploy` from this
-- repo's committed migrations, which is every one of them (CLAUDE.md).
--
-- Generated from the AuthenticationAttempt declaration in prisma/schema.prisma via
-- `prisma migrate diff`, not hand-authored. `prisma migrate dev` could not be used:
-- open issue #378 (a drifted checksum demands a full dev-database reset). The same
-- diff also reported three DROP INDEX statements for the pg_trgm trigram indexes
-- created by 20260820143949_p7_5de_order_search_trigram — the same false drift
-- CLAUDE.md documents for hand-authored DDL the Prisma schema cannot express
-- (PR #451 hit and excluded the identical three statements for the same reason).
-- Deliberately NOT included here.

-- CreateTable
CREATE TABLE "AuthenticationAttempt" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthenticationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthenticationAttempt_vendorId_ipHash_createdAt_idx" ON "AuthenticationAttempt"("vendorId", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthenticationAttempt" ADD CONSTRAINT "AuthenticationAttempt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
