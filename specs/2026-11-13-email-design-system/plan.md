---
id: 2026-11-13-email-design-system-plan
title: "Email design system and admin-editable templates (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-13
visibility: internal
summary: "One branded, responsive, Outlook-safe email layout with plain text for every email; the 14 customer emails become registered templates whose wording fields store admins can edit (layout, links and legal lines locked); store and admin emails adopt the layout."
tags: [email, design-system, templates, branding, notifications]
related: [2026-11-13-existing-account-signup-plan, 2026-11-13-abandoned-checkouts-plan, 2026-11-13-notification-gaps-plan]
---

# Email design system (plan)

Issue #1564. Requirements: `requirements.md`. Three PRs into `staging`, one promotion.

## Shape

```
lib/email/layout/
  brand.ts       EmailBrand + emailBrandFrom(profile, location, cdnBase, baseUrl, platform)
                 + contrast fallback (R2)
  render.ts      renderEmail(content, brand) -> { html, text }   (R1, R3)
  text.ts        htmlToText(html) for derived plain text (R4)
lib/email/templates/
  copy.ts        CopyFields, interpolate(), placeholder parsing (R5)
  registry.ts    the 14 template definitions: key, reason, placeholders, defaults (R6)
  customer.ts    one build function per template family returning
                 { subject, preheader, html, text }
lib/email-brand-service.ts   loadEmailBrand(vendorId, baseUrl) / getCurrentEmailBrand(baseUrl)
scripts/email-preview.ts     npm run email:preview (R9)
```

Builders keep their current call sites and signatures where possible, gaining a `brand` input;
`StoreContext` gains `brand` (loaded in `loadStore` alongside the profile it already reads), and
`NotificationMessage` gains optional `text`, carried to `email.send`. Templates return text; the
send pipeline derives text only when absent.

## Decisions

- **Mark, not logo, in the header.** Aheed's logo is WebP (Outlook desktop shows nothing). The
  512px mark is PNG. Header = 40px mark + store name in the brand colour; no mark = name only.
- **No customer names except the consented abandoned-checkout first name**: order rows carry no
  name, and sign-up/contact names are typed by whoever submits the form, so echoing them would
  relay a stranger's text.
- **Next-step sentences stay locked**: the order tracker reads the same source, so an edit would
  make the page and the email disagree.
- **Subjects drop the `— <store>` suffix**: the From name is the store already, and a shorter
  subject survives mobile truncation.
- **Footer attribution is the operator's fixed identity** (`DEFAULT_PLATFORM_NAME`/`_URL`, moved to
  `lib/platform-defaults.ts` so pure code and config-mocking tests can use them), not
  `PLATFORM_NAME`: the AFC cells set that to "Aheed Food Centre" (`wrangler.toml`), which would make
  the footer read "Powered by Aheed Food Centre".

## Part order

1. Layout, text, brand loading, 14 customer templates on defaults, preview script (this PR).
2. `EmailTemplateOverride` migration, repository + service, `/staff/email-templates`, overrides at
   render time.
3. Owner and admin emails on the layout.
