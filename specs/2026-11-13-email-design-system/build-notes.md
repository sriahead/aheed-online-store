# Email design system (build notes)

Issue #1564. Part 1 built 2026-11-13 in the worktree `E:\GitRepositories\aheed-wt-1558` (branch
`feature/1564-email-design-system`, from `origin/staging` at `fa80f3ff`).

## Part 1 — what changed

- `lib/email/layout/`: `brand.ts` (EmailBrand, contrast and background guards), `render.ts` (the
  layout, HTML and text), `text.ts` (htmlToText), `fallback.ts` (neutral brand).
- `lib/email/templates/`: `copy.ts` (fields, limits, placeholders), `registry.ts` (14 templates),
  `compose.ts` (overrides-or-defaults, render), `account.ts` (verify, reset), `enquiry.ts` (reply).
- Builders moved onto the layout, signatures kept, gaining optional `brand` and `overrides`:
  `buildCustomerEmail`, `existingAccountEmail`, `acknowledgementEmail`, `buildRecoveryEmail`.
- Brand loading: `lib/email-brand-service.ts` (`buildEmailBrand`, `loadEmailBrand`,
  `getCurrentEmailBrand`); `StoreContext.brand` built in `loadStore` from the profile it already
  read plus `VendorLocation`; contact acknowledgement loads it lazily (`ContactDeps.loadBrand`).
- Plain text: `OutgoingEmail.text`, `ResolvedEmail.text`, both adapters, `NotificationMessage.text`;
  `send` derives text from HTML when absent.
- `lib/platform-defaults.ts`: the platform defaults moved out of `lib/config` (re-exported there).
- `scripts/email-preview.ts` + `npm run email:preview`.

## Decisions found while building

- **"Powered by" is fixed to Merqify, not `PLATFORM_NAME`.** `wrangler.toml` sets `PLATFORM_NAME =
  "Aheed Food Centre"` for both AFC cells (`tests/config-platform-branding.test.ts` pins it), so
  reading it would have produced "Powered by Aheed Food Centre". The planned `PLATFORM_URL` config
  key was dropped for the same reason.
- **Platform defaults in their own module.** Several tests mock `@/lib/config` wholesale; the
  fallback brand importing from it failed under those mocks. A config-free module fixes it and is
  the truer dependency anyway.
- **Every brand read degrades, never throws.** `buildEmailBrand` catches config errors;
  `loadEmailBrand` catches read errors; the contact form's `loadBrand` is caught at the call. A
  customer email must never be lost to a branding failure.
- **The staff reply loads its brand by `vendorId`** (it already has it from `requireVendorRole`),
  not from the request host.
- **Mark, not logo**: Aheed's logo key is `.webp`; its mark is `512.png`.

## Preview for sign-off (R9)

Rendered from AFC staging's real Aheed branding and three real product names, published privately
at https://claude.ai/artifact/Btb9o4eFg4LpNXUNEzCYEk. Owner sign-off: pending.
