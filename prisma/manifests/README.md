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
