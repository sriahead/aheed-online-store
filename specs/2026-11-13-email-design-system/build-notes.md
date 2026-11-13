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
at https://claude.ai/artifact/Btb9o4eFg4LpNXUNEzCYEk. **Owner approved 2026-11-13** ("APPROVED"); part 1
merged to staging in #1565 (`d09092f5`), `deploy-staging` green including `deploy-afc`.

## Part 2 — what changed

Branch `feature/1564-email-templates-editor` from `origin/staging` at `d09092f5`.

- `prisma/schema.prisma` + `prisma/migrations/20261113180000_email_template_override/` (hand-authored
  from `prisma migrate diff` against staging's schema; one table, read before committing).
- `lib/email/templates/validate.ts` (R12), `lib/email/templates/samples.ts` (shared by the preview
  script, the editor preview and Send test), `lib/repositories/email-templates.ts`,
  `lib/email-templates-service.ts` (`loadTemplateOverrides` never rejects; page functions).
- Senders: `StoreContext.overrides` (order and basket emails), `ContactDeps.loadOverride`,
  `getCurrentTemplateOverride` for verify/reset/existing-account, `loadTemplateOverride` for the
  staff reply.
- `app/(admin)/staff/email-templates/` (list, `[key]` editor, `actions.ts`, `TemplateEditor.tsx`),
  registered in `nav-items.ts`, the feature catalogue, the Neon migration plan (`copy`) and the
  page-container list.

## Part 2 decisions

- **Preview rendered on the server** by the same builders that send, via a debounced Server Action:
  the layout imports `lib/storage`, which must not reach a client bundle, and a client-side copy
  could drift from what is sent.
- **The preview iframe is `sandbox=""`**: an admin's text is escaped anyway, but the sandbox also
  disables the sample links so nobody clicks into a sample order.
- **Send test uses `recipientIsSignedInAdmin`**: it only ever goes to the signed-in admin's own
  address, which is exactly what that flag means, so it works on staging's allowlist.
- **All-blank save deletes the row** so "Edited" always means a real edit.

## Part 3 — what changed

Branch `feature/1564-staff-emails` from `origin/staging` at `36702668` (part 2 merged in #1566).

- `lib/order-notifications/owner.ts`: `buildOwnerEmail` and `buildOwnerDigestEmail` on the layout
  (optional `brand`), `staffReason`; `build.ts` passes `store.brand` and carries `text`.
- `lib/contact/message.ts`: `contactHtml(input, brand?)` on the layout; `submit.ts` loads the brand
  once, before the store's message, and reuses it for the acknowledgement.
- `lib/client-setup-service.ts`: the test email in the store's design, with the canonical host.

## Part 3 decisions

- Subjects of staff emails are unchanged: staff filter and search their mailbox by them.
- The forwarded contact message keeps every field and the message's own line breaks; the layout
  escapes all of it (the shopper typed it).
