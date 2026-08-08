# ADR-004 slice 3b — host→tenant resolver + routing (requirements)

Resolve the vendor from the request host (issue #70, umbrella #68), building on slice 2's
`getCurrentVendorId()` seam and 3a. SriMart is added as a real 2nd vendor to prove isolation.
No Next middleware (edge runtime is forbidden by CLAUDE.md).

R1. `prisma/schema.prisma` defines `VendorDomain(id, vendorId, host String @unique, isCanonical
    Boolean @default(true), createdAt)`, FK to `Vendor` (`onDelete: Cascade`), `@@index([vendorId])`;
    `Vendor` gains `domains VendorDomain[]`. `npx prisma validate` passes. A plain additive migration
    (new table) applies cleanly with `prisma migrate deploy`.

R2. `lib/tenant.ts` resolves the current vendor from the request host: it reads `headers().get("host")`
    (lowercased, port stripped) and looks up `VendorDomain.host`. The lookup is memoized per request
    via React `cache()` and is never cached across requests.

R3. `getCurrentVendorId(): Promise<string>` keeps its non-null contract (throws on an unresolved host)
    so `lib/repositories/*` and `requireVendorRole()` are unchanged; a new
    `getCurrentVendorIdOrNull(): Promise<string | null>` returns `null` on an unresolved host.

R4. Transition rule: when no `VendorDomain` matches the host, if **exactly one** active vendor exists
    the resolver returns that vendor; otherwise (0, or 2+ vendors) it is unresolved (`null` /
    `getCurrentVendorId()` throws).

R5. `app/(storefront)/layout.tsx` calls `getCurrentVendorIdOrNull()` and, when it is `null`,
    `redirect("/coming-soon")` — so no storefront page renders (or queries) for an unmatched host.

R6. `app/coming-soon/page.tsx` exists **outside** the `(storefront)` route group (so it is not
    tenant-gated), returns HTTP 200 with a "coming soon / unknown store" message, and links to the
    default vendor's canonical host (the oldest active vendor's `isCanonical` `VendorDomain`, composed
    as `https://<host>`).

R7. `prisma/seed.ts` upserts Aheed's `VendorDomain` from `SEED_AHEED_HOST` when set, and seeds the
    **SriMart** vendor + a small visibly-distinct dummy catalogue + its `VendorDomain` **only when
    both `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` are set** — so the DB never ends up in the unsafe
    "2 vendors but a vendor has no domain" state (which would send Aheed's own host to Coming Soon).
    Idempotent; a second run adds no duplicates.

R8. `wrangler.toml` declares `srimart.nocaped.com` (production) and `srimart-staging.nocaped.com`
    (staging) as custom-domain routes on the respective Workers.

R9. Isolation holds on a seeded environment: the request host `staging.aheedfoodcentre.nocaped.com`
    returns **Aheed's** catalogue and `srimart-staging.nocaped.com` returns **SriMart's** (different
    products); an unknown host lands on `/coming-soon`.

R10. Unit tests cover the resolver: exact host match → that vendor; no match with one vendor → that
     vendor; no match with two vendors → unresolved; and the coming-soon default-host resolution.
     `getCurrentVendorId()`'s throw-on-miss is covered.

R11. `docs/env-setup.md` documents `SEED_AHEED_HOST`/`SEED_SRIMART_HOST` and the `VendorDomain` model
     (front-matter bumped); `specs/architecture.md` notes host→tenant resolution; `ARTIFACT_INDEX.md`
     regenerated.

R12. `CHANGELOG.md` updated (Gate 4), referencing #70.

R13. `lint`, `typecheck`, `test`, `format:check`, `kms:validate` all pass.
