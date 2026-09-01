-- #508 — new ErrorEvent table only.
--
-- `prisma migrate dev` initially generated DROP INDEX statements for
-- "Order_guestEmail_trgm_idx", "Order_orderNumber_trgm_idx" and "User_email_trgm_idx" ahead of
-- this. Those three are hand-authored pg_trgm GIN indexes from
-- prisma/migrations/20260820143949_p7_5de_order_search_trigram, which schema.prisma cannot
-- express (see that migration's own comment and CLAUDE.md's "no raw SQL" schema-rules section) —
-- so `migrate dev`'s diff against schema.prisma sees them as drift and proposes dropping them,
-- exactly the risk that migration's comment already warned about. Removed by hand before this
-- file was committed; the correct response, per that comment, is to keep them, not accept the
-- drop. Nothing else in this migration touches Order or User.

-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "digest" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "routerKind" TEXT NOT NULL,
    "routeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorEvent_createdAt_idx" ON "ErrorEvent"("createdAt");
