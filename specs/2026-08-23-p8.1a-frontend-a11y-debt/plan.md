---
id: p8-1a-frontend-a11y-debt-plan
title: "P8.1a — Frontend & Accessibility Debt (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-23
visibility: internal
summary: Four self-contained rendering-layer fixes closing P8.1's frontend/a11y debt — heading hierarchy, a stale report heading plus a dead client call, header resilience against extension-injected DOM shifts, and a real per-vendor contrast gap on tint backgrounds.
tags: [a11y, frontend, p8, contrast]
---

# P8.1a — Frontend & Accessibility Debt (plan)

**Goal:** Close out four independent, self-contained frontend-rendering defects tracked under the
P8.1 "Core Debt & Compliance" bucket, closing tracking issue #334 and its four sub-issues
(#254, #287, #333, #281). None share code or require sequencing against each other.

**Scope (this slice):**

- **#254 — heading hierarchy on `/orders/lookup`.** The page currently goes `h1` (line 98, "Track
  Your Order") → `h4` (line 201, pipeline step labels) → `h3` (line 221, "Items Ordered"), no `h2`
  anywhere, violating `specs/design-system.md`'s Heading Hierarchy rule (no skipped ranks; inject a
  visually-hidden `sr-only` `h2` where a visual heading is absent but semantically required). Fix:
  two `sr-only` `h2`s — "Delivery Status" ahead of the 3-step pipeline visualizer, "Order Items"
  ahead of the items summary — with the pipeline step labels promoted from `h4` to `h3` underneath
  the first. "Items Ordered" (already `h3`) sits correctly under the second.

- **#287 — two unrelated small defects from P7.5d+e, confirmed still present:**
  1. `app/(admin)/staff/reports/page.tsx`'s `<h1>` reads "Sales & Pence Financials" — stale since
     P7.5d+e added three non-sales sections below it. Renamed to "Store reports"; the three
     existing revenue tiles (Total Revenue / Total Orders / Avg Basket Value) move inside a new
     `<section>` with an `<h2>Sales</h2>`, matching the pattern the three sections below already
     use, with each tile's own heading demoted `h2` → `h3` so nothing skips a rank.
  2. `lib/repositories/loyalty.ts`'s `saveLoyaltySettings` opens with `const prisma = getPrisma();`
     and never uses it — confirmed zero `prisma.` references in the function body; the write goes
     through `getPrismaWs().$transaction(...)`. Removed. Pre-existing since P5a, harmless (a wasted
     client construction per settings save, not a correctness bug), but per `CLAUDE.md`,
     `getPrisma()` builds a fresh client on every call by design, so the dead call has a real
     (if tiny) cost.

- **#333 — header brand/logo area hardened against extension-injected DOM shifts.** Confirmed this
  session: the Coupert browser extension caused a visible header reflow in a normal Edge profile,
  absent in InPrivate — not a regression of #329's aspect-ratio fix (independently verified live on
  both staging and production). **Scoped narrower than #333's issue body proposed**, and narrower
  than Propose assumed: the fix targets the brand/logo container
  (`components/layout/Header.tsx`, the `<div className="flex items-center gap-3 shrink-0">`
  wrapping the logo `<Link>`, currently sized only by its `h-10` logo child) with `h-10
  overflow-clip`, **not** the whole header row. The row also contains `ViewSwitcher`'s dropdown
  menu (`components/layout/ViewSwitcher.tsx:80`, `absolute right-0 top-full mt-2 w-48 ...`), which
  renders *below* the row's own height — an `overflow-clip`/`hidden` on the row itself would
  visually cut that dropdown off for every staff/admin user, a real functional regression a
  same-context validator would not have caught (`CartDrawerShell`'s drawer is `fixed`, not
  `absolute`, so it escapes ancestor clipping either way and was never at risk). Scoping to the
  brand div alone protects the specific area #329 already established as the fragile one, with no
  risk to any other header control.

- **#281 — the real per-vendor contrast gap, scoped narrowly to what's actually reachable.**
  P7.5c+f clamped `--color-action`/`-accent`/`-danger` against `[white, cream]` and clamped
  `--color-primary` against `[white, cream, green-tint, orange-tint, red-tint]` — so every
  `text-primary`-on-tint pairing the app actually renders (`bg-surface-muted`, `bg-action-tint`,
  `bg-accent-tint`, all paired with `text-primary` per a repo-wide grep of real component usage)
  is already AA-guaranteed. The one pairing that is **not** — `text-danger` on `bg-danger-tint`
  (real usage: error banners, e.g. `components/orders/GuestEraseForm.tsx`-style alert blocks) —
  is unguarded, because `danger`'s clamp list never included `red-tint`. Fix: widen each of
  `action`/`accent`/`danger`'s own clamp background list to include its matching tint
  (`green-tint`/`orange-tint`/`red-tint` respectively), reusing the existing `clampForContrast`
  unchanged. `tests/vendor-theme.test.ts` gains an assertion for all three same-tint pairings, for
  both seeded vendors, so a future vendor row that breaks one fails CI.

**Deliberately excluded:**

- **Clamping the raw tint/cream background hex values themselves** — the literal reading of #281's
  "Option 1". `lib/vendor-theme.ts`'s own doc comment already flags this as visually restyling a
  vendor's page rather than just deepening an accent, a real risk for a failure mode that, per the
  grep above, does not currently reproduce anywhere in the app. Widening each foreground's own
  clamp list closes the one real gap with zero visual change to any vendor's rendered background.
  **This is a scope call made at Spec, not Propose — flagged for explicit sign-off below.**
- #281's other two options: validating branding hex at vendor onboarding (needs #278's admin UI,
  not built) and is out of scope; the CI-assertion option is included above, folded into the fix
  rather than substituted for it.
- Rewriting `/staff/reports`'s three revenue tiles through the shared `StatTile` component (they
  currently hand-roll similar markup rather than reusing it) — #287 didn't ask for this, and it's
  a bigger diff than the heading-copy fix it's attached to.
- Anything to do with a browser extension prepending content **above** the header/page rather than
  inside it — #333's own issue body is explicit that nothing on the app side can prevent that class
  of shift, and this slice doesn't claim to.

**Sign-off needed on:** the #281 scope narrowing above (widen foreground clamp lists, don't touch
background hex values) — presented for approval alongside this spec, not assumed.

**Open items carried forward:** none new. #281 is treated as closed by this fix; if that's not the
right call, it should be re-opened with the narrower gap recorded as fixed rather than the issue
being closed by mistake.
