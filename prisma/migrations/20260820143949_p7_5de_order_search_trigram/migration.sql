-- P7.5d+e (#163) — trigram indexes for the staff order search.
--
-- HAND-AUTHORED DDL — a deliberate exception under CLAUDE.md's "no raw SQL" rule,
-- which governs application code, not migrations (ruling recorded in P7d, #218;
-- specs/architecture.md 3.1 has always named pg_trgm as acceptable "only via
-- portable migrations"). The exception carries a required disclosure, which is
-- what this comment block is.
--
-- WHAT PRISMA CANNOT EXPRESS, AND WHY IT IS NEEDED
--
-- `/staff/orders?q=` filters with three case-insensitive `contains` predicates
-- (lib/repositories/orders.ts, staffOrderWhere). Prisma emits `ILIKE '%term%'`
-- for each. A leading wildcard cannot use a B-tree index, so none of Order's
-- three existing indexes — @@index([vendorId, createdAt]),
-- @@index([vendorId, status, createdAt]), @@index([vendorId, userId, createdAt])
-- — can serve the search; they serve the status filter and the ordering only.
-- The search itself was a sequential scan on every keystroke.
--
-- A GIN index with `gin_trgm_ops` CAN serve `ILIKE '%term%'`. Prisma's schema
-- language has no way to declare an index's operator class or access method:
-- `@@index([orderNumber])` always means a B-tree. There is therefore no
-- `schema.prisma` declaration that produces these three indexes, which is
-- precisely the gap this exception exists for.
--
-- THE COST, STATED PLAINLY
--
-- Because schema.prisma cannot describe them, it no longer fully describes the
-- database. `prisma migrate diff` may report drift that is not drift, and a
-- future `prisma migrate dev` may propose DROPPING these indexes. If you see
-- that, the correct response is to keep them and re-assert this migration — not
-- to accept the drop. A pointer comment on `model Order` in schema.prisma names
-- this migration so that trail is findable from the schema side.
--
-- NOTE ON CONCURRENTLY: deliberately not used. Prisma runs each migration inside
-- a transaction and CREATE INDEX CONCURRENTLY cannot run in one. These tables are
-- small enough that the brief write lock is acceptable; if Order ever grows to
-- where it is not, the index must be created out-of-band instead.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Order.orderNumber — what staff actually paste in from a customer email.
CREATE INDEX IF NOT EXISTS "Order_orderNumber_trgm_idx"
  ON "Order" USING gin ("orderNumber" gin_trgm_ops);

-- Order.guestEmail — nullable; NULLs are simply absent from a GIN index.
CREATE INDEX IF NOT EXISTS "Order_guestEmail_trgm_idx"
  ON "Order" USING gin ("guestEmail" gin_trgm_ops);

-- User.email — the third search arm is a relation filter, which Postgres plans
-- as a subquery against User. Indexing only the two local Order columns would
-- leave account-holder searches on the same sequential scan #163 is about, so
-- this index is part of the same fix rather than a separate concern. User is
-- global (not vendor-scoped) by design — see ADR-004; the vendor boundary is
-- enforced by the surrounding Order.vendorId predicate, not by this index.
CREATE INDEX IF NOT EXISTS "User_email_trgm_idx"
  ON "User" USING gin ("email" gin_trgm_ops);
