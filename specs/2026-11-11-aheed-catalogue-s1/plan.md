---
id: 2026-11-11-aheed-catalogue-s1-plan
title: "Aheed catalogue S1: departments, restricted lines, price list, real images (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-11
visibility: internal
summary: "Make the imported Aheed catalogue browsable and safe before go-live: a 12-department tree, restrictions on tobacco, alcohol, lottery and phone-card lines, the owner's price list as main data, and real product images. Staging first."
tags: [catalogue, aheed, departments, restrictions, price-list, images, go-live]
related: [2026-10-22-catalogue-restrictions-stock-states-plan, architecture]
---

# Aheed catalogue S1 — plan

Acceptance criteria: `requirements.md` in this folder. Issues: `#1330` (departments, price list),
`#1200` (restricted lines), `#1515` (images); tracking `#1337`.

## Order of work (each step: dry run, apply on staging, verify, then production on owner approval)

1. **S1c restricted lines** — `scripts/catalogue-restrict-by-policy.ts`, with `--soften-plu` for lines
   the till misfiled under hard-block departments (owner chose 4559, 4981, 5516, 6424).
2. **S1b department mapping** — `scripts/catalogue-department-map.ts` (`propose` → owner review CSV →
   `apply`), rules in `prisma/manifests/aheed-department-map.json`.
3. **Department tree** — `scripts/catalogue-taxonomy.ts` with `prisma/manifests/aheed-taxonomy.json`.
4. **Price list** — `scripts/catalogue-load-price-list.ts`; the list stays outside the repository.
5. **S1d images** — blocked on a barcode export from the till (`#1515`).
6. **S1e activation** — waits for the owner.

## Production run order

Restrictions first (so no restricted line can ever be switched on), then the department mapping, then
the tree, then the price list. Every script refuses a production secrets file without `--production`
and needs `--confirm-host`; take a Neon backup branch first.
