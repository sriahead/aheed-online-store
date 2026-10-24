# Vendor manifests

A manifest is everything a vendor needs to **exist and render**: its identity, branding primitives,
config, delivery areas, loyalty tiers, discount codes, footer and its request host. One file
provisions one vendor:

```bash
npx tsx scripts/provision-vendor.ts prisma/manifests/example.json
npx tsx scripts/provision-vendor.ts prisma/manifests/example.json --validate-only
```

`--validate-only` parses the manifest and exits without constructing a database client, so it needs
no credentials.

## A real client's manifest is not committed to this repository

`example.json` is a worked example and is the only manifest kept here. A real client's manifest is
operator input, held outside the repo and passed by path — it carries that business's contact
details, trading address, company and VAT numbers and delivery area, which is their commercial data
rather than ours, and a git commit is permanent even if the file is later deleted. This is the same
reasoning that keeps the client's stock export out of the tree (`.gitignore`).

## What provisioning does and does not write

**Writes:** `Vendor`, `VendorBranding`, `VendorConfig`, `VendorDeliveryArea`,
`VendorFulfilmentSlot`, `VendorExpressSchedule` (only when the vendor offers collection),
`VendorLoyaltyTier`, `DiscountCode`, `VendorLocation`, `VendorWeeklyHours`, `VendorPaymentBadge`
and `VendorDomain`.

**Does not write:** `Category`, `Product` or `Brand`. **A newly provisioned vendor has an empty
catalogue, and that is expected** — importing a catalogue is `#1201`, a separate slice.

## Rules the schema enforces

- Every object is **strict**: an unknown or misspelled key is an error, never a silently dropped
  value that leaves the vendor on a default nobody chose.
- `id` is **supplied by the manifest**, not generated. Every write is an upsert on that primary key,
  so re-running the same manifest changes nothing. A generated id would create a second vendor on
  the second run.
- `slug` is lower-case letters, digits and hyphens.
- Brand primitives are `#rrggbb`. They are the eight `--color-brand-*` tokens, and
  `lib/vendor-theme.ts`'s `brandStyle()` passes each through a WCAG AA contrast clamp at render
  time, so a low-contrast choice here is corrected for legibility rather than rejected on write.

## Two things to do by hand afterwards

1. **The host must also be in `wrangler.toml`.** Adding the `VendorDomain` row is not enough — the
   Worker needs a route for that hostname, and a `wrangler deploy` that omits a live host tears its
   custom domain down. Generate the block with
   `npx tsx scripts/verify-worker-routes.ts --env <env> --write`, commit it, and deploy. The deploy
   workflows run the same script as a precondition and fail if a trading vendor's host is missing.
   See ADR-004's 2026-10-21 implementation note for why this is not yet data-only.
2. **A logo is an upload, not a file in this repo** (ADR-003). Leave `logoStorageKey` as `null` and
   upload on `/staff/storefront`, which writes the relative key itself.

## Placeholders, readiness and the route block (#1216)

A manifest may contain values the owner has not confirmed yet (delivery fee, free-delivery threshold,
minimum order, postcode prefixes, sender e-mail, footer address). The schema stays strict, so a
placeholder is a real value of the right type, marked in one of two ways:

- the top-level `placeholders` array lists dotted field paths (`"config.deliveryFeePence"`,
  `"deliveryPrefixes"`, `"footer.location"`), and each must name a real field — this is the only way a
  number can carry the mark;
- a string containing `OWNER TO CONFIRM`, ending `.invalid`, or written `[IN BRACKETS AND CAPS]`.

```bash
npx tsx scripts/provision-vendor.ts <manifest> --check-ready
npx tsx scripts/provision-vendor.ts <manifest> --emit-route --env staging
```

`--check-ready` needs no database and exits 1, listing every path still awaiting the owner.
`--emit-route --env staging|production` prints the `wrangler.toml` route block **only** for a ready
manifest whose host is deployable (no port, not `localhost`); otherwise it exits 1 and prints nothing
on stdout. Provisioning a **dev** database with placeholders is allowed and prints the list.

These are gates the operator runs, not CI checks: a real manifest is never committed, so CI cannot
see one. See `docs/developer-portal/client-onboarding-prerequisites.md`.

## Importing a catalogue

`example-import-profile.json` is a worked import profile with neutral names; a real client's profile
(its column headings and the owner's department rulings) is held outside the repository, like its
manifest. It is used by `scripts/import-catalogue.ts`:

```bash
npx tsx scripts/import-catalogue.ts --validate-profile prisma/manifests/example-import-profile.json
```
