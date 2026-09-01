---
id: stale-vendor-domains
title: "Remove staging hosts from production's VendorDomain (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Production's VendorDomain held two staging hosts alongside the two correct ones, giving each vendor two canonical hosts; they are removed with a guarded, explicit-target script.
tags: [multi-tenant, production, data, tenancy]
related: [roadmap, architecture, adr-004-multi-tenancy]
---

# Remove staging hosts from production's VendorDomain (plan)

**Goal:** leave production's host-to-tenant mapping describing only production, and provide a safe,
repeatable way to remove a `VendorDomain` row without risking a live outage.

Issue **#519**, found while verifying #518's production seed.

## What was wrong

Production's `VendorDomain` held **four** rows where it should hold two:

| vendor | host | canonical |
|---|---|---|
| aheed-food-centre | `aheedfoodcentre.nocaped.com` | true |
| aheed-food-centre | `staging.aheedfoodcentre.nocaped.com` | true |
| srimart | `srimart.nocaped.com` | true |
| srimart | `srimart-staging.nocaped.com` | true |

All four were marked canonical, so **each vendor had two canonical hosts**. The likeliest origin is
an earlier seed run pointed at production while carrying staging's `SEED_*_HOST` values — the same
class of confusion as `#119` and P5a's migration reaching production ahead of its promotion PR.

**The contamination is one-directional.** Staging's own table was checked before assuming that, as
`#519` asked: it holds `localhost`, `staging.aheedfoodcentre.nocaped.com` and
`srimart-staging.nocaped.com` — all correct for staging, with no production hosts.

## Why this was worth fixing rather than leaving

The rows were inert in normal operation. Staging's Worker resolves tenants against **staging's**
database, so nothing ever asked production's database about a staging host.

They stop being inert as soon as anything else resolves a host against production's data — a
restore into another environment, a shared-database diagnostic, a future preview environment.
`lib/tenant.ts` treats a `VendorDomain` match as authoritative, so a stale row is a silent
mis-tenanting waiting for the right conditions rather than a cosmetic untidiness.

## Scope (this slice)

**`scripts/remove-vendor-domains.ts`** (new) — takes `--env-file`, one or more `--remove <host>`,
and writes nothing unless `--apply` is passed. Prints the resolved database host and the full
current table before acting.

**Explicit hosts rather than a pattern.** A rule like "delete anything containing `staging`" is the
kind of cleverness that eventually deletes a legitimate row in an environment nobody had in mind
when it was written. Naming each host on the command line puts the blast radius in the shell
history.

**A last-canonical-host guard, which is the load-bearing safety check.** Removing a vendor's only
canonical host routes every request for it to `/coming-soon` — a live outage, not a tidy-up. The
script refuses to do that regardless of what was passed.

**The production rows themselves are removed**, and both vendor sites verified still serving their
own tenant afterwards.

## Deliberately excluded

- **Any change to `lib/tenant.ts`'s resolution logic.** The rows were wrong; the lookup is not.
- **A guard in `prisma/seed.ts` refusing a host that does not match the connected database.** `#519`
  raises it as worth considering and it is a reasonable idea, but it needs its own thinking about
  how the seed would know which environment it is pointed at — the connection host alone does not
  say "this is staging". Left in `#519`'s discussion rather than half-built here.
- **`isCanonical` semantics.** Four canonical rows across two vendors was a symptom of the stale
  data, not a separate defect; with the stale rows gone each vendor has exactly one.

## Open items carried forward

- **#523** — the give-up path for products the image pipeline can never fill. Its immediate
  symptom was resolved by a manual admin upload; the mechanism is unchanged.
- The six S3/CDN secrets for the `production` GitHub environment, still outstanding from `#518`.
