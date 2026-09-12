---
id: 2026-09-11-vendor-colour-pickers
title: "Vendor colour pickers (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-11
visibility: internal
summary: Add visual colour pickers to the staff storefront configuration form, with a live preview of the contrast-clamped semantic values.
tags: [admin-panel, branding, styling]
related: [2026-08-20-p7.5cf-vendor-storefront-identity, 2026-09-10-brand-colour-validation]
---

# Vendor colour pickers (plan)

The per-vendor branding setup currently exposes eight hex colour values as plain text inputs. While this allows fine-grained control, it provides no visual feedback. More critically, the vendor storefront runs all submitted colours through a strict WCAG AA contrast clamp (`clampForContrast()`) before rendering them. A vendor typing a pale mint hex will see their text input accepted, but the actual storefront will render a deep green, which looks like a bug to the user.

**Goal:** Provide an honest WYSIWYG experience in the admin panel by pairing each hex input with a native colour picker, and displaying a live preview of the contrast-clamped values that will actually render on the storefront.

**Scope (this slice):**
- Refactor `StorefrontConfigForm.tsx`'s brand colour section to use controlled React state (`useState`), synchronised with the form action.
- Add an `<input type="color">` alongside each existing text input.
- Render a live preview section below the inputs that passes the current local state through `brandStyle()` (from `lib/vendor-theme.ts`) and displays the resulting semantic CSS variables (e.g. `--color-primary`, `--color-action`) in representative UI mock blocks (e.g. text on a surface, buttons, error banners).
- Map the camelCase fields from `VendorBranding` to the kebab-case `BrandPrimitives` format required by `brandStyle()`.

**Deliberately excluded:**
- **Schema/Theme changes:** No changes to the database schema, no new seeded themes, and no changes to the existing theme copy semantics.
- **Colour validation:** Covered by the prerequisite #713 (merged).
- **Column renaming:** `brandGreenDark` being semantically primary is a known naming debt; changing it would require a DB migration, which is explicitly out of scope.
