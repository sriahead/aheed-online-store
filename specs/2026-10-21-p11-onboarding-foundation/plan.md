---
id: p11-onboarding-foundation-plan
title: "P11 onboarding foundation — host guard, route verification, vendor manifest (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-21
visibility: internal
summary: "First slice of P11: a shared staging/production host guard (#490), a deploy-time check that wrangler.toml never omits a trading vendor's host (#1198), and a manifest-driven vendor provisioner so a third vendor needs no seed.ts edit (#1197). No schema change."
tags: [provisioning, multi-tenancy, deployment, safety, seed]
related: [architecture, adr-004-multi-tenancy, env-setup, sdd-operator-runbook, roadmap, discovery-log]
---

# P11 onboarding foundation — host guard, route verification, vendor manifest (plan)

**Goal:** make the two hand-edit hazards in vendor onboarding impossible rather than documented, and
make a third vendor provisionable without editing a 2,754-line seed file. Shipping this slice means
a new vendor is a manifest file plus a reviewed `wrangler.toml` change that **cannot** silently drop
a trading vendor's domain, and that no bulk provisioning script can be pointed at staging or
production by accident.

This is the first slice of `P11 — Repeatable Vendor Onboarding`. It closes `#490`, `#1198` and
`#1197`. The client-specific Excel adapter is `#1201` and is **not** in this slice.

## Scope (this slice)

### 1. `#490` — one shared host guard

`scripts/verify-repository-injection.ts:88-137` already implements the strong version of this
control: it reads `secrets/staging.vars` and `secrets/production.vars`, refuses **before any Prisma
client is constructed**, and in its own words has "deliberately no override flag". It also refuses
when *neither* secrets file can be read, rather than treating absence as safety.

Two subtleties move out verbatim, because a guard missing either is bypassable:

- `normalizeHost` strips `-pooler.`, so a pooled and a direct Neon URL resolve to the same host.
- the var-file regex tolerates the **spaced-equals** form (`KEY = "value"`), which `#505` recorded
  in two reference-database keys.

It lands in **`scripts/lib/protected-hosts.ts`**, beside the existing `scripts/lib/env-file.ts`.
`#490`'s body rules out `lib/` under `#489`'s no-application-code posture, and `scripts/lib` is the
precedent that already exists. Consumers: `verify-repository-injection.ts` (refactored to import,
behaviour unchanged), and `prisma/seed.ts`'s generated-catalogue path — which is `#490`'s actual ask,
because today that path prints the resolved host and trusts a human to read it. `CLAUDE.md` records
that exact control failing once: at `#1134` a session-inherited `DIRECT_URL` migrated production
while both env files correctly named dev.

### 2. `#1198` — the route list is checked against the vendors that are actually trading

**The hazard.** `wrangler.toml` declares each vendor host as its own `custom_domain = true` route —
four blocks, two per environment. The committed comment states the consequence: a host "must be
declared here so `wrangler deploy` doesn't tear down the custom domain". So a hand edit that omits a
live host is **destructive and silent**, and nothing compares the file against the database.

`scripts/verify-worker-routes.ts` reads `VendorDomain` over the target environment's `DIRECT_URL`,
parses `wrangler.toml`'s route patterns for that `--env`, and fails the deploy if a routable host has
no route. `--write` emits the correct block, so adding a vendor is paste-not-author.

**Why the wildcard option was rejected** (owner decision, 2026-10-21, after the Cloudflare account
was read rather than assumed). `nocaped.com` is an active `full` zone on the **Free** plan. Proxied
wildcard DNS is no longer Enterprise-only, so a wildcard route *was* available. It lost on
certificate depth: **Custom Domains cannot be wildcards at all**, and a wildcard route plus
Universal SSL covers exactly **one** subdomain label. `staging.aheedfoodcentre.nocaped.com` is two
labels deep and works today only because a Custom Domain issues a per-hostname certificate. A
wildcard would therefore have required either renaming a live staging host or buying Advanced
Certificate Manager on a Free zone. Both were rejected in favour of removing the hazard at no cost.
This paragraph exists so the option is not re-proposed without the SSL constraint.

**No TOML dependency is added.** The repo has no TOML parser and adding one is a new
infrastructure-adjacent dependency for a 30-line need. The script reads exactly the shape this file
uses — `[[env.<name>.routes]]` tables with a `pattern` key — and because the same script *generates*
that shape under `--write`, the reader and the writer are self-consistent and unit-testable.

**The check runs in the two deploy workflows, not in `quality.yml`, and that is a stated exception
to `CLAUDE.md`'s "add a check there, not to a caller" rule.** It needs the *target environment's*
`DIRECT_URL`, which a PR runner does not have, so in `quality.yml` it could only skip — and a skip
line is not a pass. It is a per-deploy-target precondition, not a quality check. It sits after
`prisma migrate deploy` (so the database is current) and before `wrangler deploy` (the one step that
can destroy a domain). **The build→migrate order is untouched.**

### 3. `#1197` — a manifest in front of the existing provisioning functions

**This is larger than the proposal implied, and the reason is worth stating.** The `/propose`
comment described the manifest as "a loader in front of" `upsertVendorSatellites`,
`upsertVendorDomain` and `seedFulfilmentSchedule`. Checking the file showed **nothing in
`prisma/seed.ts` is exported** — all three are module-private and close over a module-scoped
`prisma`. So the manifest is impossible without first extracting them.

They move to **`prisma/provision-vendor.ts`**, each taking a `PrismaClient` as its first parameter.
That signature is not invented: `prisma/seed-footer.ts` already exports
`seedFooterDefaults(prisma, vendorId, defaults)`, so the extraction follows a precedent in the same
directory rather than introducing a convention. `seed.ts` imports them and behaves identically.

**Only vendor-level provisioning is extracted.** `seedCatalogue`, `seedBundles`, `seedPriceTiers`,
`seedAttributes` and the rest stay in `seed.ts`: they are fixture-shaped, and the catalogue write
path belongs to `#1201`, which needs row-level idempotency that `seedCatalogue` deliberately does
not have (`prisma/seed.ts:1035-1047` skips a whole category when its slug exists).

**The existing Aheed and SriMart fixtures are deliberately not converted to manifests.** They are
the multi-tenant test data: SriMart's colours differ, it runs no loyalty scheme and offers no product
labels, and `CLAUDE.md` requires branding checks be verified against a second vendor precisely
because several false-positive against Aheed. Converting them would risk that coverage for no gain.
The manifest serves the **third** vendor onward.

Every write in those functions is already an `upsert`, so idempotency comes free — but it is asserted
as a requirement rather than assumed, because a re-run is the whole point.

## Deliberately excluded

- **The Excel/catalogue adapter — `#1201`.** A vendor provisioned by manifest has **zero products**.
  That is expected, not a defect.
- **Wildcard routing**, for the certificate-depth reason above. Not revisited in this slice.
- **Any schema change.** `VendorDomain.host` is already unique; nothing new is needed. Source-row
  traceability and a `Product.sourceRef` column stay with `#1201`, which rules them out in favour of
  the import report.
- **VAT, cost price, supplier, barcode, case size, reorder levels, stock movements** — all gated on
  `#1196`.
- **Restricted-product exclusion rules** — `#1200`, owner- and legal-gated.
- **Converting `prisma/seed.ts` to manifests wholesale.** Only the three functions above are
  extracted.
- **Deduplicating `AHEED_VENDOR_ID`**, which is declared at `prisma/seed.ts:56` *and* exported from
  `prisma/seed-footer.ts:38`. Noticed while scoping this slice; harmless today because both literals
  are identical, and touching it is unrelated cleanup. Recorded here so it is not mistaken for
  something this slice introduced.
- **A `/staff/*` platform-admin UI for vendor creation.** It needs a platform-admin authorisation
  story distinct from `VendorMembership`; the operator script is the smaller first step.
- **Generating `wrangler.toml` in CI.** The script's `--write` mode prints a block for a human to
  commit. Generating the deployed file in the runner would make the deployed config differ from the
  config reviewed in the PR, for a file whose omissions are destructive.

## Open items carried forward

- **`#1196`** — storefront or stock management. Owner-gated, sizes `#1201`.
- **`#1200`** — restricted-category include/exclude. Owner- and legal-gated.
- **`#1201`** — the Excel adapter, plus the three client answers it needs (opening stock balance,
  whether a barcode/supplier export exists, whether the £0.00 and `DEFAULT` rows are live products).
- **Backups and recovery remain undocumented — tracked as `#436`**, not a new finding. That issue
  ("Verify Neon backups/PITR and perform a real restore test", `P09.2`, open) already requires
  verifying capability, recording retention, defining RPO/RTO and performing a real restore. Out of
  scope for this slice, but **a client handover that promises a recovery responsibility needs `#436`
  closed first**, so it is a candidate to pull forward into P11 rather than something to re-file.
- **ADR-004 decisions 3 and 7 are corrected, not satisfied.** A new vendor still costs a row plus a
  commit plus two deploys. If "no deploy" is wanted later, the wildcard analysis above is the
  starting point and the SSL-depth constraint is the thing to solve first.
