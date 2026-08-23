# Changelog

All notable changes to the Aheed Online Store are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/). Per SDD Gate 4, this file is updated **before**
every branch merges.


### Fixed
- **UI — the header logo caused a visible layout jerk on every page refresh** (`components/layout/Header.tsx`). The logo was `h-10 w-auto` with no reserved box and no `width`/`height`, so it occupied **zero width** until its bytes decoded, then snapped to ~72px and shoved the entire header row — search bar and nav included — sideways. This is a layout shift, not an animation, which is why the `transition-all` sweeps in #323/#324 could not have caught it, and why it survived them. It is made far worse by the logo being 1.9 MB (83% of page weight, already tracked as #243): the larger the payload, the later and more jarring the jolt. Fixed by pinning `aspect-9/5` (1.8, matching both seeded logos at 298x160 and 1664x928) alongside the existing `h-10`, which reserves the 72x40 box before the image loads, plus `object-contain` so a vendor whose logo is a different shape is letterboxed rather than distorted — and still never shifts. Dimensions cannot come from the database: `VendorBranding` stores only `logoStorageKey`, with no width/height. Audited the other four storefront images while here — `ProductCard` (`aspect-4/3` + intrinsic `width`/`height`), `ProductImageGallery` (`width`/`height`), `PromoCarousel` (`h-32 w-32`) and `CartContents` (`h-16 w-16`) all reserve their boxes correctly; the header logo was the sole outlier, and the only one positioned above the whole page.

### Fixed
- **UI — carousel pagination dot stopped animating** (`components/layout/PromoCarousel.tsx`). The `transition-all` -> `transition` sweep in PR #324 correctly stopped the layout thrashing, but over-corrected at one site: Tailwind v4's `transition` property list contains no `width`, so the active promo dot's `w-2` -> `w-4` expand began snapping instead of animating. Restored with an explicit `transition-[width,background-color]`. Safe at this site specifically because the dot row is `absolute bottom-3 left-1/2`, i.e. out of document flow, so animating its width cannot move page layout. Verified by compiling Tailwind 4.3.3 directly rather than relying on documentation; the same check confirms `translate`, `scale` and `rotate` **are** in the default list, so the `ProductCard` hover-lift and `DepartmentScroller` hover-scale were never affected by the sweep.

### Documentation
- **UI polish & docs integration slice: specs corrected and completed** (`specs/2026-08-22-ui-polish-docs-integration/`). `requirements.md` R1 and `validation.md` V1 described a global transition rule in `app/globals.css` (`200ms cubic-bezier` on interactive elements, plus a `button:active` scale-down) — and V1 was ticked `[x]` against it — but that rule was removed in `a9d886c` precisely because it was the cause of the page-refresh layout thrashing. Both rewritten to state the rule that actually holds (per-component transitions naming their properties; never `transition-all`, never a global element-selector rule), with the superseded text preserved and attributed rather than deleted. `build-notes.md` updated for the same reason.
- **Added the slice's missing `plan.md`.** It was the one required spec file never written, which is also why the slice never appeared in `ARTIFACT_INDEX.md` — the KMS index keys artifacts on `specs/<slice>/plan.md`. Index rebuilt (`npm run kms:build-index`, 97 artifacts). This closes both failures reported by `npm run sdd:audit`.
- **`specs/roadmap.md`:** added the missing change-log row citing the slice, and repaired PowerShell backtick damage in the two 2026-08-22 rows, where a literal CR byte (`0x0D`) sat mid-line inside `resolveLines` and four pairs of backticks had become backslashes.
- **`CHANGELOG.md`:** removed two stray NUL bytes (`0x00`) at end of file. They made every tool treat this file as binary — ripgrep refused to search past them, and `git diff` could not produce a text diff — which is a good way for a changelog defect to hide.

### Changed
- **Documentation Architecture:** Restructured the entire docs/ directory into a role-based architecture (Shopper, Staff, Admin, Marketing, BA, Ops, Dev). Rewrote end-user documentation to hide technical implementations and focus entirely on user workflows.

### Added
- **Shop Your List Partial Matches** (Issue #115): Implemented partial-match fallback in `resolveLines` (lib/shopping-list.ts). When a pasted list line contains terms that don't all match a single product, the candidates with the most matched terms are returned as "ambiguous" for user review, instead of discarding the line completely.

### Changed
- **Header UI**: Added a "Shop List" button to the main navigation (beside the search input) for better discoverability.
- **Cart UI**: The Cart popover now automatically closes when navigating away (e.g. to checkout or the full cart view).

### Added
- **P8.1 — Unified Role-Aware Help Centre** (#318, `specs/2026-08-21-p8-help-centre/`). Replaced the dead 'Help Guide' link in the global storefront header with a unified `/help` page. The page statically renders delivery, loyalty, discount, and privacy FAQs for shoppers. For authenticated `STAFF` and `ADMIN` users, it dynamically renders an 'Internal Staff Resources' section containing instructions on using the View Switcher and a direct link to the Operational Runbook.

### Fixed
- **UI:** Replaced `transition-all` with `transition` across storefront components (`ProductCard`, `Header`, `PromoCarousel`, etc.) to prevent jarring layout thrashing/animations on page refresh when components dynamically mount and adjust dimensions.
- **Vendor repository exports** (#318 follow-up): Exported `getVendorConfig`, `getVendorBranding`, `updateVendorLogoKey`, and `updateVendorStorefrontConfig` from `lib/repositories/vendor.ts` — these were referenced by the storefront page and server actions but missing from the module. Resolved build failure on staging.
- **Prettier formatting**: Re-ran Prettier across 9 files touched by the Storefront Branding UI (PR #315) and Help Centre (PR #319) that had not been auto-formatted before merging.

### Changed
- **Cart UI**: Converted the top-header Shopping Cart into a bottom-right Floating Action Button (FAB). This completely decouples the cart from the header layout, providing a stable, jump-free header when toggling between Shopper and Staff views, and improves mobile accessibility.

### Changed
- **Header UI**: Replaced the disjointed 'Staff Panel' button and 'Tier Toggle' with a unified 'View Switcher' dropdown in the main Header. Staff and Admin views correctly configure the header layout to hide the shopper search bar and cart drawer. The View Switcher respects role-gating so STAFF users only see Shopper and Staff views.


### Changed
- **Admin UI**: Unify admin Operations Portal layout with storefront theme. Removed custom PortalHeader in favor of standard <Header />, moved TierToggle to PanelNav, added horizontal scrolling to PanelNav tabs, and configured pp/(admin)/staff/page.tsx to read the tier cookie so Admin users can successfully preview the limited staff layout.

### Fixed
- **CI**: Injected missing Cloudflare AI secrets (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN) into the production worker runtime in .github/workflows/deploy-production.yml.

### Added
- **Documentation**: Added missing roadmap change-log entry for P8 smart image generation (and PR #292 carry-forward) to satisfy the SDD audit.
- **P8 — Smart Product Image Generation** (#293 + hotfixes #301–#304, `specs/2026-08-20-p8-smart-image-generation/`). Added AI image generation and barcode lookup fallback to automate product image creation. Integrates Open Food Facts API and Cloudflare Workers AI `flux-1-schnell`. Added manual generation button in the Admin UI (`ProductImageManager`) and a batch **"Auto-fill Missing Images"** button on the products list page that triggers the backfill API job. Added `imageNeedsReview` flag with an **"Approve Image"** banner so staff can review and clear AI-generated images. Staging validation surfaced and resolved: worker secrets not bound to runtime, edge `require()` incompatibility, Prisma HTTP transaction incompatibility, Cloudflare AI `429` rate-limit bursts (retry backoff added), missing Approve UI, invalid design-system class names in the banner, and a Cloudflare NSFW false-positive on food-photography prompt language (prompt simplified to neutral form).
- **P7.5d+e — staff panel completion: order-search index, product filters, tier CRUD, customer
  directory & non-sales reports** (#264, closing #265, #160, #161, #169, #163, #136,
  `specs/2026-08-20-p7.5de-staff-panel-completion/`). **P7.5's final slice** (epic #260), combining
  slices d and e because all five underlying issues live on the same `/staff/*` surface behind the
  same demo-admin `npm run preview` rig, and standing that rig up twice is the real cost — the same
  reasoning that combined c+f. Built #163 first, since it was the only item carrying
  production-migration risk and must not gate the four pure-assembly items.
  **The staff order search stops being a sequential scan** (#163): the repo's **first
  `CREATE EXTENSION`** installs `pg_trgm` and adds three GIN trigram indexes over
  `Order.orderNumber`, `Order.guestEmail` and `User.email`. No application code changed —
  `staffOrderWhere()` was already correct, only slow, because a leading-wildcard `ILIKE` cannot use
  any of `Order`'s three B-tree indexes. Taken as a **deliberate hand-authored-DDL exception** under
  the P7d (#218) ruling, which costs a disclosure in the migration naming what Prisma's schema
  language cannot express (an index's access method or operator class) and a pointer comment on
  `model Order`; both are present, as is the standing consequence that `schema.prisma` no longer
  fully describes the database. The `User.email` arm the plan left open **is** index-servable.
  **`/staff/products` gains search and a status filter** (#169): a plain GET form mirroring
  `/staff/orders`, with pagination that carries the filter. New pure `lib/staff-products-query.ts`
  deliberately inverts the orders module's default — an absent or unrecognised status applies **no**
  `isActive` filter, because P6b1 shipped this list showing hidden products on purpose so an owner
  can find what they switched off; three of its twelve tests exist only to pin that.
  **Loyalty tiers become creatable and deletable** (#136): duplicate keys are refused by
  `@@unique([vendorId, key])` through the existing `isUniqueViolation` helper rather than
  check-then-insert, so concurrent creates cannot race and the same key stays creatable for another
  vendor. Delete deliberately leaves `LoyaltyLedgerEntry` alone — `tierKey` is a snapshot with no
  foreign key, so a ledger row naming a removed tier is correct, not dangling. The per-row Remove
  control binds to a separate top-level form via `form="delete-tier"` and carries the key as its own
  name/value, since HTML forbids the nested form the single-form layout would otherwise need (P7a,
  #162 pattern).
  **A customer directory exists** (#160, new `/staff/customers`): a customer is derived from
  vendor-scoped `Order`, never from the global `User` table, which makes the tenant boundary
  structural rather than a filter someone must remember. Guests appear by email; P7b-erased orders
  (both `userId` and `guestEmail` nulled) collapse into one honest "Erased customers" aggregate
  rather than being dropped, so the directory still reconciles against `/staff/reports`.
  **Non-sales reports** (#161): catalogue and stock health, loyalty liability, and discount
  redemption config. **No sales analytics** — production still runs Stripe test keys (#113), so
  there is no real trading data to design it against. Liability calls `visibleBalance()` per account
  rather than `SUM(balancePoints)`, which would overstate it by every lapsed balance still sitting in
  the table — the same class of knowably-wrong aggregate as #238, the defect P7.5a exists to fix.
  Also on the branch: the **PR #285** roadmap promotion row `sdd:audit` reported as pending
  carry-forward, and a `CLAUDE.md` correction — its staff-panel rule pointed at
  `app/(admin)/staff/layout.tsx`, a file that has never existed (the shell is
  `app/(admin)/layout.tsx`), and it now also records `loyalty/page.tsx` as a second `PanelRefusal`
  instance, converted here.
- **P7.5c+f — per-vendor storefront identity: copy, promotions & contrast-clamped colour** (#263,
  closing #239, #233, #255, and #266 which was folded in at Propose,
  `specs/2026-08-20-p7.5cf-vendor-storefront-identity/`). Third slice of **P7.5** (epic #260),
  combining slices c and f because neither can be proven by the test suite — `brandStyle()` injects
  per-vendor tokens as an inline style that outranks `tokens.css`, so both halves are only
  observable in live rendered HTML for two hosts, and that rig is the expensive part.
  **The storefront stops speaking in Aheed's voice** (#239): ~12 hardcoded strings were classified
  rather than columnised. The hero's "Free Delivery Over £30" now reads
  `freeDeliveryThresholdPence` — Aheed's threshold *is* £30, so the literal was accidentally true for
  the vendor it was written for and wrong for SriMart at £50; it was hiding a data bug, not just a
  copy one. A minimum-order badge follows the same rule and both hide when the rule doesn't apply.
  Unverifiable claims ("100% Certified Halal Meat", "Same-Day Local Dispatch") are deleted rather
  than made configurable; the four trust tiles become three statements true of the *platform* and
  checkable against this repo (locality delivery, Stripe payment, order-status email). Only genuine
  vendor identity became columns — `VendorConfig.bannerNote` and `.heroSubtitle`, both hiding when
  null, since platform-written filler is still a claim made on a vendor's behalf. Three surfaces #239
  never listed were found during Build: the search-placeholder fallback, the hero `h1`'s tagline
  fallback (the one slot that keeps a fallback — an empty `h1` is an accessibility defect), and
  `{localityName} Groceries` in the logo-fallback wordmark, which rendered "Reading Groceries" under
  SriMart's name and survived because Aheed has a logo so nobody ever saw it.
  **Promotions become real vendor data** (#233): new 1:N `VendorPromotion` model
  (`lib/repositories/promotions.ts` + request-scoped `lib/promotions-service.ts`, so the #252
  allowlist gains no tenth facade) driving a new `PromoCarousel` in the hero's image slot. It replaces
  `PromoSlider`, a hardcoded array of three invented offers that rendered for every vendor and
  advertised discounts nothing in the engine backed — SriMart has no discount codes at all.
  `imageKey` is **nullable on purpose**: a promo with no artwork renders as a token-styled card, so
  both vendors ship live-verifiable promotions with zero uploads, and seeding keys for objects nobody
  uploaded is how #244 happened. The carousel carries a real pause control, pauses on hover/focus and
  honours `prefers-reduced-motion` — `PromoSlider` auto-advanced every 5s with no way to stop it,
  failing WCAG 2.2 SC 2.2.2.
  **Per-vendor colour returns with a guarantee** (#255): new zero-import `lib/color-contrast.ts`
  converts sRGB to OKLCH, lowers lightness until the value clears AA against every surface it renders
  on, and preserves hue and chroma (reducing chroma rather than clipping channels when out of gamut,
  because clipping shifts hue — the one property the module exists to protect). `brandStyle()` now
  derives `--color-primary`/`-action`/`-accent`/`-danger` and the two hover shades per vendor through
  that clamp. Measured: Aheed `#4caf50` 2.78:1 → `#1e8929` 4.50:1 and `#f57c00` 2.70:1 → `#ba5d00`
  4.51:1; SriMart `#1e88e5` 3.68:1 → `#0078d3` 4.54:1. Aheed's `#d32f2f` already measures 4.98:1 and
  comes back untouched, which `tests/color-contrast.test.ts` pins — the clamp must not damage a
  compliant colour. **The clamp is load-bearing, not a safety net:** Aheed's own primitives fail
  hardest of anything in the repo, so an unclamped restoration would have re-broken the vendor that
  has been live longest. Backgrounds (`--color-surface-muted`, the three tints) stay plain aliases —
  clamping them would move the surface rather than the foreground (#281).
- **P7.5b — order money provenance: points earned and discount code on order pages** (#262, closing
  #138, #150, `specs/2026-08-20-p7.5b-order-money-provenance/`). Second slice of **P7.5** (epic
  #260). An order's money summary now explains itself, with no schema change — both relations
  already existed.
  **The discount says which code produced it** (#150): `Order.discountPence` is one generic figure
  that since P5b can combine a loyalty redemption *and* a code, so labelling the whole amount with a
  code's name would state something false. New `splitDiscount` (`lib/order-totals.ts`) divides it —
  code share from the stored `DiscountRedemption.amountPence` snapshot, loyalty share by
  **subtraction**. Deliberately not recomputed from `pointsToPence(points, pencePerPointRedeemed)`:
  the ledger stores redemptions in points and that config can change after an order, so a recomputed
  share would drift from the figure beside it. `lib/order-totals.ts` keeps **zero imports**, which is
  what structurally prevents it reaching vendor config.
  **Orders show the points they earned** (#138): read from the EARN ledger row `confirmPayment`
  writes inside its own transaction, so the figure is a settled fact. An order still awaiting payment
  shows a line carrying **no digits** rather than an estimate — the tier multiplier is snapshotted
  onto the EARN row precisely because it moves. A guest order says nothing at all, in any status.
  New `OrderPointsNote` is a separate component rather than part of the money card, because
  `OrderItemsCard` is shared with `/staff/orders/{n}`: the staff view gets the same attributed
  discount rows (deliberately — two stories about one order is the defect this phase removes) while
  points, an account fact, stay off it. The confirmation email uses the same `splitDiscount`, not a
  second arithmetic.
- **`/document` closeout for P7.5b (#262, PR #272, merged to staging) — P7.5's second slice.**
  Roadmap (v1.39.0) gains the build/validate/merge row, plus a backfilled row for **P7.5a's
  promotion to production** (PR #271, `staging → main`, merge `b8066e2`) that `npm run sdd:audit`
  reported as pending carry-forward. `/validate` closed R19/R20 with a full live Stripe test-card
  checkout → webhook → confirmation round-trip via the Stripe CLI, not unit tests alone; `CLAUDE.md`
  gains a new "Local Stripe webhook testing" section recording the `stripe listen` signing-secret
  and Resend sandbox traps hit along the way. Delivery board reconciled: #262 confirmed **In
  Review**. New issue **#273** filed (Phase P8, Backlog) for two hand-inserted dev-DB
  `DiscountRedemption` fixture rows found during validation, unrelated to this slice's code.
  `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and `npm run kms:validate` both clean; the
  internal KMS docs site (`kms/site-internal`) rebuilds and compiles cleanly.

### Changed
- **`specs/roadmap.md` (v1.42.0)** — P7.5d+e's `/document` closeout (#264). Roadmap gains the
  slice's build/merge row (PR #289) and the production-promotion row (PR #290, which also carries
  **P7.5 — Pre-launch closeout of P3/P5/P6 deferred debt is closed** — fourteen carried-forward
  P3/P5/P6 issues resolved across the phase's six slices, and "safe to start P8" is now a statement
  the roadmap can point at). The promotion row records that `deploy-production`'s migration step
  (`CREATE EXTENSION pg_trgm` + three trigram indexes) applied cleanly, confirmed directly from the
  workflow's own log, and the post-promotion issue-state check confirming no accidental closure
  among the nine issues explicitly carried into P8.
- **`specs/2026-08-20-p7.5de-staff-panel-completion/requirements.md`** — R27 and R36 corrected at
  `/validate` after being found genuinely broken (R27 demanded an impossible keyset pagination for
  a `groupBy` aggregate with no stable key; R36 directly contradicted R25's own per-customer-spend
  requirement) — both amended rather than shipped disclosed-but-unreconciled. Detail in
  `build-notes.md`'s "Deviations from the spec" section.
- **`specs/decisions/ADR-004-multi-tenancy.md` (v1.5.0)** — decision 5 amended by P7.5c+f (#263).
  It said per-vendor primitives are injected and "the **semantic** layer and every component stay
  unchanged." Components still are; the semantic *layer* no longer is, because `brandStyle()` now
  derives the foreground tokens per vendor through `clampForContrast`. The original wording was
  written when "semantic layer unchanged" and "vendors are differentiated" were compatible — #251
  broke that tie by decoupling three tokens into audited constants, and the clamp resolves it
  properly rather than picking a side. Also records that promotional content is vendor data on the
  same principle (#233).
- **`specs/design-system.md` (v1.8.0)** — the "do not restore the brand hex into the semantic layer"
  rule now says **raw** brand hex, and explains why the word matters: writing a primitive straight
  into the semantic layer stays forbidden (Aheed's `#4caf50` and `#f57c00` measure 2.78:1 and 2.70:1,
  the worst in the repo), while deriving one through the clamp is the opposite operation — it cannot
  return a value below the ratio it was given — and is how per-vendor colour is now delivered. A
  reader applying the old wording literally would have rejected the mechanism that enforces it.
- **`specs/decisions/ADR-005-payments-money-flow.md` (v1.5.0)** gains a P7.5b implementation note
  recording the subtraction rule and the two upstream clamps that make it safe (`lib/discounts.ts`
  bounds a code's face value; `clampRedemption` fills only the headroom it left), so `splitDiscount`
  needs no defensive cap — and stating that recomputing the loyalty share from vendor config must not
  be "fixed" back in later.
- **`specs/roadmap.md` (v1.41.0)** and **`specs/sdd-workflow.md` (v2.20.0)** — P7.5c+f's `/document`
  closeout (#263). Roadmap gains the slice's build/merge and production-promotion rows, including the
  live-verification detail (four DB-mutation rows and the carousel's pause control all closed live,
  not left disclosed-but-unverified) and an honest note that this session's sandboxed network egress
  couldn't reach either deployed domain directly, so "production is serving this commit" rests on the
  `deploy-production` workflow's own log rather than an independent curl. `sdd-workflow.md` gains two
  process lessons this loop surfaced: a generalisation of the `PromoSlider`/P4a bare-word-match trap
  to `validation.md` rows whose literal grep command is a stricter or looser proxy for its own
  requirement's actual wording (three instances found this pass, none real defects); and the root
  cause of PR #283's `mergeable: CONFLICTING` — PR #275's squash-merge had left `origin/main` without
  P7.5b's original commits as ancestors, which broke the *next* regular-merge promotion with a
  spurious conflict in the shared log files, resolved with a content-identical reconciliation merge
  pushed to `staging` rather than a forced rewrite. Promotion PRs should use a regular merge, never
  squash, to avoid recreating this.

### Fixed
- **P7.5a — staff reports correctness & checkout cart preservation** (#261, closing #238, #237,
  #234, `specs/2026-08-19-p7.5a-reports-cart-integrity/`). First slice of **P7.5**, the pre-launch
  closeout of P3/P5/P6 deferred debt (epic #260). The three places this system asserted something
  false to the person acting on it.
  **Revenue no longer counts orders that were never paid for** (#238): `getFinancialsForStaff`
  aggregated on `vendorId` alone, so abandoned checkouts and cancelled orders were reported as money
  taken — **39% overstated**, measured on staging. New `REVENUE_STATUSES` in `lib/order-status.ts`
  (`CONFIRMED`/`OUT_FOR_DELIVERY`/`DELIVERED`), written as a literal and deliberately **not** derived
  from `STAFF_QUEUE_STATUSES`, which is a worklist and omits `DELIVERED`. Avg Basket Value derives
  from the same two figures, so one filter corrects all three tiles.
  **The admin panel is no longer edge-cached** (#237): `/staff/reports` served a signed-in admin
  stale financials despite `force-dynamic` — so Next was not the cache. The app emitted no
  `Cache-Control` on any HTML route, leaving an intermediary free to invent a policy. Every
  `/staff/:path*` response now carries `private, no-store, must-revalidate`; storefront routes are
  deliberately untouched.
  **A failed payment no longer destroys the basket** (#234): `placeOrder` clears the cart inside the
  order transaction (load-bearing for double-submit safety), and when `createPayment` threw, the
  compensation returned stock, points and the discount-code use but not the cart — so "please try
  again" left the shopper an empty basket. New `restoreCartFromOrder` refills the originating cart,
  called from `placeOrder`'s `catch` rather than `releaseOrder` (which the Stripe webhook shares for
  sessions that expired hours earlier), and **only when `releaseOrder` actually cancelled**, so a
  racing confirmation cannot hand the shopper a duplicate basket for an order they paid for.

### Changed
- **`specs/architecture.md` (v1.16.0) — Cloudflare's edge cache is documented as active, not
  optional.** Its caching section listed "Cloudflare's own edge cache in front of the Worker" as
  something that *could* be added; #237 proves it is already there and was caching authenticated
  admin pages. Now states the rule: a per-session or role-gated route must declare its cacheability
  explicitly, because `force-dynamic` governs Next's rendering and not what sits in front of the
  Worker — two different things with an identical symptom.
- **`specs/decisions/ADR-005-payments-money-flow.md` (v1.4.0)** gains a P7.5a implementation note.
  Its P3c note described the payment-failure compensation as releasing stock, which understated it
  after this slice; the note records both constraints on `restoreCartFromOrder` (called outside
  `releaseOrder`; only on a real cancellation) that a later consolidation would otherwise undo.
- **`specs/roadmap.md` (v1.37.0)** gains the **P7.5** phase entry — six slices covering fourteen
  issues, with eleven others explicitly deferred to P8 and **#137/#151 explicitly not scheduled**
  (structurally unreachable until refunds exist) — plus the PR #259 promotion row that
  `npm run sdd:audit` reported as pending carry-forward.
- **`/document` closeout for P7.5a (#261, PR #268, merged to staging) — P7.5's first slice.**
  Roadmap (v1.38.0) gains the build/validate/merge row, including the real dev-Neon-branch
  credential failure `/validate` hit mid-run (handled per `CLAUDE.md`'s hard stop — recreated, not
  guessed) and the two live rows it unblocked (R5, R13) once the branch was recreated. Delivery
  board reconciled: #261 confirmed **In Review**. New issue **#269** filed (Phase P7, Backlog) for
  R8 — confirming the new `/staff/*` cache header actually stops staleness on the real Cloudflare
  edge, deliberately deferred past Ship rather than exercised for its own sake once
  `deploy-staging` was already green. `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and
  `npm run kms:validate` both clean.
- **`/document` closeout for P7 closeout (#251, PRs #256/#257, now in production) — P7 is closed.**
  Roadmap gains the build/validate/fix, staging-merge and promotion rows, plus a phase-closure
  summary. `CLAUDE.md` gains a new "Design tokens & per-vendor branding" section recording the
  `brandStyle()` trap `/validate` found (a jsdom test that parses `tokens.css` directly proves
  nothing about what a browser renders when a parallel per-vendor CSS-injection mechanism can
  silently override the same tokens). `specs/design-system.md`'s per-vendor-theming note corrected
  to match verified reality — it previously said both the primitive and semantic layers are
  overridden per vendor; only primitives, `--color-primary`/`--color-surface-muted` and the three
  semantic tints are, since the `/fix` that landed with #251. Delivery board reconciled: #251/#217/
  #220/#222/#90 confirmed `Done`; #252/#253/#254/#255 (all filed during this slice or its `/fix`)
  given **Phase P8** so they don't sit unscheduled and un-phased. `ARTIFACT_INDEX.md` rebuilt;
  `npm run sdd:audit` and `npm run kms:validate` both clean.

### Added
- **P7 closeout — accessibility gate, RLS determination, guest data rights** (#251, closing #217,
  #220, #222 and the phase epic #90, `specs/2026-08-19-p7-closeout/`). One combined slice, decided
  at `/propose`.
  **Accessibility:** `eslint-plugin-jsx-a11y`'s recommended set now runs at `error` across `app/`,
  `components/` and `features/` — `eslint-config-next` already activated six of its rules but all at
  severity 1, so `npm run lint` exited 0 with real defects present. `CartDrawerShell` (the live cart
  drawer) gains the keyboard half of the dialog contract it lacked: focus moved into the panel on
  open, a `Tab`/`Shift+Tab` trap, focus restored to the cart button on close, `Escape`, and
  `aria-labelledby` naming its own heading. Key handling sits on `document` rather than the dialog
  container, because a container handler stops firing the moment focus leaves — which is when
  `Escape` matters most. New `tests/a11y/*` assert all of it in jsdom.
  **Guest UK GDPR erasure:** P7b gave account holders export, erasure and rectification; a guest who
  checked out without an account had no route to any of them. `/orders/lookup` now offers erasure
  behind the same order-number/email pair, rate-limited by the same limiter and budget (a fast "no
  such order" is an oracle for guessing pairs). `eraseGuestOrderData` verifies the pair itself, at
  the query level, inside the transaction — there is no window between proving ownership and
  erasing. One order per request, stated up front in both the form and the confirmation.
- **`tests/repository-vendor-scoping.test.ts`** — the compensating control for RLS. Walks each
  repository's TypeScript AST and asserts every exported function querying a `vendorId`-bearing
  model takes a vendor id, and that a function given one actually references it. Twelve exceptions
  allowlisted with reasons.

### Changed
- **Three semantic colour tokens darkened for WCAG 2.2 AA** — `--color-action` `#4caf50` →
  `#2e7d32`, `--color-accent` `#f57c00` → `#a85400`, `--color-danger` `#d32f2f` → `#c82d2d`, plus
  both derived hover shades. The `--color-brand-*` primitives keep their exact brand-kit values;
  only the semantic layer moved, which corrected **45-plus call sites across 20-plus files with no
  component edits**. The brand values fail AA in combinations the UI actually renders: action and
  accent on white at 2.78:1 and 2.70:1 (both under even the 3:1 UI threshold), and `--color-danger`
  on `--color-danger-tint` at 4.36:1 — the standard error-message treatment at `text-sm` in
  checkout, every account form and `OrderStatusBadge`. `tests/design-tokens-contrast.test.ts` reads
  `tokens.css` directly and asserts 17 pairs, so a future "restore the brand colours" edit fails.
  `specs/design-system.md` records why, and its Accessibility section — which already mandated
  icon-only `aria-label`s, no heading skips and non-brand-green button contrast — now notes that
  `CartDrawer.tsx` broke three of those rules while the doc stated them. Rules nobody executes are
  not controls.
- **ADR-004: row-level security determined NOT adoptable** (v1.4.0). Decision 2 deferred RLS to P7
  on the guess that per-request session vars on Workers isolates would be "fiddly". Measured, it is
  unavailable: `PrismaNeonHttp` has no session for a `SET LOCAL` GUC to live on, and the adapter
  refuses transactions in HTTP mode outright (`Transactions are not supported in HTTP mode`) — so
  the batched escape hatch does not exist at the adapter layer either. Adopting RLS would mean
  routing every read through WebSockets, the configuration that caused #187. Evidence in
  `specs/2026-08-19-p7-closeout/rls-experiment.md`, re-runnable via `scripts/rls-experiment.ts`.
  Neon's JWT-on-connection RLS would sidestep it but is gated behind Neon Auth, which `CLAUDE.md`
  keeps off. ADR-004 states the residual gap rather than implying parity.
- **`CLAUDE.md`'s repository-facade rule no longer contradicts itself.** It directed facades into a
  sibling `lib/<name>-service.ts`, then held up `getCartRepository` as the thing to match — while
  that function's own *location* is the violation, so a reader following it literally reproduced the
  defect. Now says to copy the shape, not the address, and names all nine non-compliant factories
  (#252).

### Fixed
- **The WCAG AA contrast fix above never reached a real rendered page — found at `/validate`,
  fixed at `/fix`** (#251). `lib/vendor-theme.ts`'s `brandStyle()` injects per-vendor branding as an
  inline style on every page's root element, and was re-declaring `--color-action`, `--color-accent`,
  `--color-danger` and their hover shades straight from each vendor's raw primitive colour — the
  same 1:1 mapping `tokens.css` used *before* this slice darkened those five independently of the
  primitives. An inline style always beats a stylesheet rule, so every real page kept rendering the
  pre-slice, AA-*failing* hex regardless of `tokens.css`; the jsdom contrast test never caught it
  because it reads `tokens.css` directly rather than rendering through the real layout. Fixed by no
  longer re-declaring those five tokens per vendor — they now resolve to the platform's fixed,
  audited default everywhere. `--color-primary`, `--color-surface-muted` and the three semantic
  tints are unaffected and still vary per vendor, since `tokens.css` still defines those as plain
  primitive aliases. **Consequence:** SriMart's own action/accent/danger primitives (never
  contrast-audited) no longer drive those three roles — SriMart now renders the same audited colours
  as every vendor there, trading its prior, unaudited differentiation for a real AA guarantee. Filed
  as **#255**: whether/how to bring back per-vendor differentiation for these three tokens with a
  real contrast guarantee is its own decision.

### Removed
- **`components/cart/CartDrawer.tsx`** — dead code. Added by P7a (`624a842`) and never imported by
  anything, as `git log -S` confirms across all branches; the live drawer is `CartDrawerShell.tsx`,
  rendered by `Header.tsx`. It held both violations the new accessibility gate found. #251's spec
  originally targeted it for the dialog-semantics work, which would have asserted accessibility
  properties of a component no user can reach.

### Added
- **P7d — Workers observability and the first NFR measurement** (#218,
  `specs/2026-08-19-p7d-observability-nfr/`). `wrangler.toml` gains a top-level `[observability]`
  block (`enabled = true`, `head_sampling_rate = 1`, inheritable by both envs) — until now there was
  no way to take a server-side latency measurement at all, while `specs/mission.md` had set
  `LCP < 2.5s` and API `p95 < 400ms` as Gate-3 criteria from the start. `scripts/measure-nfr.ts`
  (+ `npm run nfr:measure`) measures client-observed TTFB percentiles over public routes with no
  database credential or session, so the numbers are reproducible from a clean checkout. Results are
  recorded in the new `docs/nfr-baseline.md`, which labels every figure client-observed or
  server-side rather than blurring the two.
  **API p95 meets its target** (worst warm route 138.92 ms vs 400 ms; cold start 924.94 ms recorded
  separately rather than averaged away). **LCP breaches it by ~5x** — 11,700 / 12,482 / 12,633 ms
  across three Lighthouse runs. The cause is one asset: the vendor logo is **1,926,055 bytes, 83% of
  page weight**, rendered into a 40 px-tall box on every storefront page, and it is `docs/logo.png`
  uploaded unresized. Filed as **#243**; not remediated here because the fix is an account/plan
  decision plus asset ops, not repo code.
- **`Order(vendorId, userId, createdAt)` index** (migration
  `20260818233907_p7d_order_user_history_index`). `specs/architecture.md` §3.4 claimed an
  `Order(userId, createdAt)` index served order history; **it never existed**, so `listForUser`
  (which filters `{vendorId, userId}`) could only walk the *vendor's* orders and discard other
  customers' rows — one shopper's history costing the whole store's order volume. At 118 rows the
  fix is not observable, and the baseline says so rather than claiming a speed-up.

### Fixed
- **Two persistent docs corrected against the artifact rather than against each other.**
  `specs/architecture.md` §3.4 named two indexes that did not exist and both omitted the leading
  `vendorId` ADR-004 requires; the paragraph is now reconciled to `prisma/schema.prisma`.
  `specs/tech-stack.md` still presented Next.js Data Cache / ISR as the catalogue caching strategy,
  which `specs/architecture.md` has documented as unworkable on this stack since P2a — whichever
  document a reader opened first decided what they believed.
- **A `<1%` table cell in `docs/nfr-baseline.md` broke the internal KMS docs site build.** MDX
  parses a bare `<` followed by a digit as the start of an invalid JSX tag name, which failed
  `deploy-docs-internal`'s Nextra build the moment this doc was assembled into the site. Reworded
  to "under 1%"; the app's own `gates`/`build` never touch this pipeline, so the app-level slice
  PR's CI stayed green while this broke on the next push. Found and fixed at `/ship` for #218
  (PR #245/#247).

### Changed
- **#46 settled: keep plain `<img>`.** Cloudflare Image Transformations are **not enabled** on this
  zone (`/cdn-cgi/image/…` returns 404 in all three URL forms), so a `next/image` custom loader
  would ship byte-for-byte identical images. `ProductCard` and `ProductImageGallery` gain intrinsic
  `width`/`height`, and the gallery's first image loads eagerly at high priority;
  `@next/next/no-img-element` is now off repo-wide with the reasoning inline, replacing a mix of
  inline disables that made the warning meaningless. Admin and staff surfaces untouched.
- **`CLAUDE.md` now states that "no raw SQL" governs application code, not migrations.** This was
  never actually undecided — `specs/architecture.md` §3.1 has said it since the schema was written —
  but it was absent from the file read at decision time, which is why GAP-011 sat deferred behind an
  answer that already existed one document over. Unblocks the `pg_trgm` question (#163/GAP-011) and
  the same question in #220 (RLS).

### Documentation
- **#236 re-driven with real Server Action calls** (25 sequential at ~1.1 s and 30 back-to-back both
  clean; **20 concurrent produced 3 connection-level failures**). The reported sequential ceiling did
  not reproduce — the constraint is concurrency, not rate. Whether those failures are server-side or
  the client's own socket pool is **deliberately not asserted**: separating them needs the persisted
  Workers Logs that only exist after `deploy-staging`. **#163** and **#236** stay open with their
  measurements recorded; **#244** is new — production's vendor logo object was never uploaded, so
  every production page renders a broken image (verified with and without a `Referer`, ruling out
  hotlink protection).
- **`/document` closeout for the validation debt bucket (#231, PRs #240/#241).** Roadmap gains the
  `/fix` and Ship-time rows (PR #240 to staging, PR #241 promotion to production, post-promotion
  issue-state check confirming no accidental closure). `docs/gap-register.md` gains GAP-024 (the
  `/staff/runbook` `PanelRefusal` gap `/fix` corrected). Two lessons recorded while still cheap:
  `CLAUDE.md` gets a new "Staff panel pages" section (every `/staff/*` refusal branch must render
  `PanelRefusal`, never `return null`, since the layout shell still renders around a `null` page);
  `specs/sdd-workflow.md` gets a third instance of the grep-matches-the-explanation trap, this time
  in a requirement's own literal text (R40 was broader than its own `validation.md` row).
  `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and `npm run kms:validate` both clean.
- **`/document` closeout for P7d (#218, PRs #245/#248/#247, now in production).** Roadmap gains the
  build/validate, staging-merge, `deploy-docs-internal` fix, and promotion rows. `CLAUDE.md` gains a
  new "KMS docs" section and `specs/sdd-workflow.md`'s Validate pre-flight names the real check for
  any slice touching `docs/`/`specs/` — the app's own `lint`/`build` never build the internal KMS
  site, so a defect there (this slice's MDX-breaking `<1%` table cell) merges clean and only fails
  on the next push. `docs/nfr-baseline.md`'s Observability section reconciled with what Ship actually
  found: persisted-Workers-Logs confirmation stayed blocked in that environment even after deploy
  (both `wrangler tail` and the Cloudflare dashboard), filed as **#246** rather than left as an
  implicit promise. `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and `npm run kms:validate` both
  clean.

### Added
- **`sdd:audit` now checks promotions, not just slices** (#207,
  `specs/2026-08-18-validation-debt-bucket/`). A merged `staging → main` PR with no
  `specs/roadmap.md` change-log row was structurally invisible to the audit, which is how the same
  gap recurred five consecutive times, each caught by eye at a later `/orient` while the check
  reported green. `scripts/sdd-promotions.ts` holds the matcher as a pure, importable module —
  `sdd-check.ts` calls `process.exit()` at module scope, so importing *it* from a test would kill
  the run. A row must cite `PR #NNN` or the merge SHA; a bare `#NNN` deliberately does not count,
  since issues and PRs share one number space here. The check **skips rather than fails** when `gh`
  is unavailable, and reports a promotion merged after the last roadmap edit as a *pending
  carry-forward* rather than a gap, so it can't fire falsely on every branch cut after a promotion.
  **On its first real run it found three promotions nobody knew were undocumented — PRs #118, #121
  and #134** — whose rows are backfilled here.
- **Test coverage for `reverseRedemption`'s null-owner path** (#224). P7b made
  `LoyaltyLedgerEntry.userId` nullable, forcing a behaviour change that `/validate` called the
  highest-risk edit in that diff and that shipped verified by code reading alone: when the
  redeeming user has been erased, the `LoyaltyAccount` credit is skipped while the `REVERSAL` row
  is still written. Five cases in `tests/loyalty-repository.test.ts`, including a live-owner
  contrast case so the null assertions prove a real branch.

### Fixed
- **The homepage hero no longer loads a CSP-blocked external image.**
  `app/(storefront)/page.tsx` hardcoded an `images.unsplash.com` photo — the only external image
  URL in the codebase — while P7a's `Content-Security-Policy` allows
  `img-src 'self' data: https://*.nocaped.com`. It had been failing its CSP check in production
  since PR #206 promoted the CSP on 2026-08-17, and rendered identically for every vendor, which
  P6.6's own R12 forbids. Confirmed still live and blocked on staging at `64e4a46`
  (`unsplashLoaded: false`). The hero keeps its token-driven brand panel and glow; a real
  per-vendor hero image needs a `VendorConfig` field and a migration (**#233**).
- **`/staff/runbook` now refuses a signed-in non-staff visitor the same way every other staff page
  does.** Its role check returned `null` on refusal instead of rendering `<PanelRefusal>`, so a
  signed-in customer got a blank content area inside the admin shell (HTTP 200, no message) rather
  than "Staff only — this area is restricted to store staff." Found at `/validate` by exercising the
  exact row `build-notes.md` had disclosed as never fired; fixed to match the other 8 `/staff/*`
  pages' pattern.

### Changed
- **P6.6's and P6.6c's exit gates rewritten so they can be walked** (#192 item 4). Six of P6.6's
  eight validation rows asked a reader to confirm the UI "matches the prototype" — unfalsifiable,
  the same defect P6.5's gate was rewritten to remove. P6.6c had never used the Gate-2 format at
  all: checkbox bullets on both sides, so no numbering to map one onto the other. Now `R1..R14` and
  `R1..R17` respectively, every row naming a command, a file property or an observable behaviour.
  P6.6c's navigation requirement states a required **subset** rather than "all 9 tabs", which P6.7
  falsified by legitimately adding a tenth. **Neither rewrite was edited to match the code**: where
  the artifact fails an obligation, the obligation stands and the gap is tracked.
- **`docs/gap-register.md` 2.4.0** — GAP-016..GAP-023, six of them found by actually walking the
  rewritten gates and by #103's live window rather than by reading anything.
  `specs/sdd-workflow.md` 2.17.0 and `CLAUDE.md` updated: both described `sdd:audit` in terms the
  promotion check made incomplete.

### Validated
- **P3c's R7 payment-failure path proven live for the first time** (#103), in a deliberate,
  separately-confirmed window against staging's Worker (13:21:05Z → 13:25:00Z). With an invalid
  `STRIPE_SECRET_KEY`, order `AHE-20260818-U82BM2` was left `CANCELLED` with two `OrderStatusEvent`
  rows (`PENDING_PAYMENT` → `CANCELLED`, *"Payment provider unavailable; order cancelled and stock
  released."*) and `Inventory.quantity` restored to **exactly** its pre-order value. The key was
  restored from `secrets/staging.vars` and the restore proven by a new Stripe Checkout session
  created through the real app — not by the write's exit code, since Cloudflare secrets cannot be
  read back.
- **P6.6 and P6.6c walked against their rewritten gates**, which found two defects no amount of
  reading would have caught: **SriMart, an electronics store in Reading, advertises certified halal
  meat** because `Header.tsx`/`page.tsx` hardcode Aheed grocery copy (**#239**), and the staff
  financial report **counts cancelled and unpaid orders as revenue** — £1,162.64 of a £3,003.49
  headline, 39%, never collected (**#238**). Both were reachable only by exercising the artifact
  against a second tenant and against real order data.
- Deferred with issues filed, not remembered: **#232** (wishlist link never built), **#233**
  (per-vendor hero image), **#234** (payment failure destroys the cart while telling the shopper to
  try again), **#235** (CDN hotlink 403s local preview, so no image renders there), **#236** (rapid
  cart mutations still reach a failure ceiling), **#237** (admin financial report served stale from
  cache despite `force-dynamic`).

### Docs
- **`/document` pass reconciling P7b (#216) + the local dev environment tier (#226) with their
  live promotion to production** (PR #229, `staging → main`, merge `6a6f51d`). `specs/roadmap.md`
  gains the dev-environment slice's first-ever roadmap entry (build through staging merge, PR #228,
  never recorded until now) and a promotion row covering both slices together — staging was 13
  commits ahead of `main` at promotion time, so a docs-only slice and a GDPR feature carrying a
  real migration went out in the same PR. `npm run sdd:audit` confirms all slices documented.
  `CLAUDE.md` gains a new Windows-shell lesson: `npx tsx -e "<script>"` fails **silently** (no
  stdout, no stderr, exit 0) the moment the inline script imports an installed package, hit three
  times during `/validate`'s live R10 isolation check before switching to a real `.ts` file — write
  ad hoc DB scripts to a file inside the repo, not `-e`, for anything beyond a trivial one-liner.
- **Local `dev` environment tier** (`specs/2026-08-18-dev-environment/`, closes #226). `docs/
  env-setup.md` gains a "Local development (dev)" section: one disposable Neon **branch** per
  developer (not a project, unlike staging/production — a personal branch holds no real vendor
  data, so ADR-004's "separate projects, not branches" ruling doesn't apply), branched off
  **staging** so it inherits current schema + seed/demo data with no `db:seed` step, and reset by
  delete-and-recreate. Deliberately **local-only**: no `wrangler.toml` env block, no deploy, no CI,
  no GitHub environment, not routed through `scripts/configure-env.mjs` — both files are untouched
  by this slice. Object storage is one **shared** `aheed-images-dev` R2 bucket across every
  developer, not per-developer. Fixes the actual behaviour this replaces: `.env`/`.dev.vars`
  previously pointed local `next dev`/`npm run preview` straight at the **staging** database and
  bucket, so every local validation pass either risked staging data or needed scratch infra stood
  up by hand — `.env.example`/`.dev.vars.example`'s `S3_BUCKET` placeholder is corrected from
  `aheed-images-staging` to `aheed-images-dev` accordingly. Docs-only; no application code, no
  schema change. Live-branch proof (a personal branch boots with seed data intact and is provably
  isolated from staging) is deferred to `/validate`, once a developer has created their own branch
  by hand per the new doc section.
- **`/document` pass reconciling P7b's staging merge (PR #223) with what `/validate` actually
  found.** `specs/roadmap.md` now records the real `/validate` → `/fix` cycle: a genuine spec
  contract violation (`getDataRightsRepository()` had been added to `lib/repositories/data-rights.ts`
  and called `getCurrentVendorId()` with no explicit `vendorId`, breaking that file's own "every
  export takes prisma/vendor explicitly, no request context" property) and a `validation.md` gap
  (the slice's migration was never instructed to be applied to staging before the write-path
  harness, unlike the catalogue-debt-bucket slice's own `validation.md`). Both fixed before shipping;
  R15's coverage gap (harness never exercised `DiscountRedemption`) closed in the same pass.
  `CLAUDE.md` gained a new "Repository layer" section recording the facade-placement rule generally
  (`lib/auth-rbac.ts`'s pattern — a request-context wrapper beside, not inside, `lib/repositories/`)
  so future slices don't rediscover it; `specs/sdd-workflow.md` gained the missing-migration-step
  trap so it's written into every slice's `validation.md` that ships a migration, not left to be
  rediscovered per-slice. Filed **#224** (untested `reverseRedemption` null-owner refund path,
  a real behaviour change reached sideways through this slice's migration) rather than leaving it
  as an unverified `/validate` note. Issue #216 moved to **In Review** (staging only, not promoted).

### Added
- **UK GDPR data-subject rights — download, correct and erase your data** (P7b, issue #216,
  `specs/2026-08-18-p7b-data-rights/`). `/privacy` §5 already told customers they could "access,
  rectify, or request deletion" by contacting a "privacy compliance team" that exists nowhere in
  the app, and none of the three had a mechanism behind it: no export path anywhere in the
  codebase, no account deletion, and `/account` rendering name/email/role as static text with no
  edit control. New `/account/data` offers all three. **Export** (Art. 15) is a JSON download
  served by a route handler, covering account details, orders, addresses, reviews, basket, loyalty
  and discount redemptions — and deliberately no credential material: linked accounts disclose the
  provider name only, sessions their metadata but never the token. **Erasure** (Art. 17) keeps the
  money and drops the person — orders are tombstoned with totals and items untouched, addresses
  redacted in place (`Order.addressId` is not nullable, so the row cannot go), reviews/basket/
  loyalty balance deleted, and the loyalty ledger and discount redemptions retained but detached.
  **Rectification** (Art. 16) is name-only for now; email change needs verification mail and is
  deferred to #221 behind #104.
- Everything is **vendor-scoped** (ADR-004 global identity + row-level `vendorId`): erasing at one
  store leaves your account at another untouched, and the shared sign-in is deleted only when no
  other vendor still holds data. The platform-wide alternative was rejected because it needs
  un-scoped repository methods, and this repo's one existing un-scoped read is what became P7a's
  order-disclosure defect. `countOtherVendorData` is the single permitted cross-vendor query,
  contracted to return an integer and never rows — recorded in ADR-004 so it doesn't read as
  precedent.

### Changed
- **`LoyaltyLedgerEntry.userId` is now nullable with `ON DELETE SET NULL`** (additive migration
  `20260818021500_p7b_loyalty_ledger_user_nullable`). It was non-null with `Cascade`, so deleting a
  `User` destroyed the ledger rows that are the only explanation of a surviving order's
  `discountPence` — a financial audit trail the order must retain, and a violation of that model's
  own documented append-only invariant. Consequently `reverseRedemption` now skips the
  `LoyaltyAccount` balance update when the owner has been erased (there is no balance left to
  credit) while still writing the `REVERSAL` row, so the trail balances and the idempotency guard
  still holds.
- **`specs/roadmap.md`'s P7 and P8 lines no longer both claim backups and monitoring.** P7 said
  "backups + monitoring" while P8 said "backups/PITR, monitoring", so each phase could assume the
  other owned them — the same shape that let GAP-010 sit unbuilt behind an accounted-for row.
  Resolved at `/propose`: **P8 owns them**; P7 stops at what lives in the repo. P7's remainder is
  now four tracked slices — #216 (this), #217 accessibility, #218 observability + index/query
  review, and #220 row-level security, the last being an already-approved ADR-004 obligation the
  first decomposition had missed entirely.

### Fixed
- **Production R2 bucket CORS applied** (#180, GAP-007 → `Fixed`) — owner action, no code change.
  `aheed-images-production` had never had a CORS policy, so every browser-direct presigned `PUT`
  failed preflight. This stopped being a dormant P6 leftover the moment PR #214 promoted the
  multi-image manager: **every admin image operation in production was failing**. Absence confirmed
  first (`The CORS configuration does not exist [code: 10059]`), then verified by live `OPTIONS`
  preflight in both directions — both production origins return `204` with the origin echoed, while
  the staging origin and an unknown origin both return `403` with no `Access-Control-Allow-Origin`,
  proving the policy discriminates rather than being permissive.

### Docs
- **`/document` pass reconciling both promotions to production (PR #214) and a real
  closing-keyword incident.** `specs/roadmap.md` now records the catalogue-debt-bucket slice's
  actual staging outcome (both R2/R15 blockers found and resolved before Ship — one was a test-
  harness bug, the other a local-only R2 CORS limitation, not app defects) and the combined
  production promotion. **Issue #174 was closed by accident during that promotion** — a `/fix`
  commit message quoting the exact wrong text it was correcting (`"closes #174"`, inside a sentence
  saying the opposite) still matched GitHub's closing-keyword scanner, which reads every commit in
  the merged set, not just the PR body. Caught within minutes via the routine post-promotion
  issue-state check, reopened with an explanatory comment, board status corrected. Recorded a
  sharper version of this trap in `specs/sdd-workflow.md`'s Ship section: `closingIssuesReferences`
  doesn't see every commit message, so it isn't sufficient on its own — the literal string
  `closes #NNN` (or any closing-keyword variant) must never appear anywhere near an issue number
  that must stay open, including inside a quotation.

### Fixed
- **The homepage's "New Arrivals" and "Featured Halal Deals" rows rendered nothing at all**
  (issue #211, closes #208's remainder). Both fetched products via
  `productsRepo.search("", {...})`; `search()`'s empty-query guard — correct for its real caller,
  the `/search` page — unconditionally returns zero results, and `ProductRow` renders `null` for
  zero products. Neither row's title appeared anywhere in `npm run preview`'s rendered homepage
  before this fix. Added `ProductRepository.list()` for filtered listing without search text;
  `search()` itself is unchanged.

### Added
- **Real `Product.isFeatured` flag** (additive migration), replacing the `isHalal` proxy the
  homepage's featured rail ran on (GAP-013, #208). Admin checkbox in `ProductForm`, rail retitled
  "Featured Products". Deliberately independent of `originalPrice`'s existing discount-badge
  derivation — featured and "on offer" stay two separate concepts.
- **Multi-image admin management** (GAP-014, #173): add a second (or third...) image, set which one
  is primary, remove one, reorder them — `lib/repositories/products.ts`'s `addProductImage`/
  `promoteProductImage`/`removeProductImage`/`reorderProductImages`, four new server actions, and
  `components/staff/ProductImageManager.tsx`. The real gap was bigger than "remove and reorder are
  missing": no code path had ever created a second `ProductImage` row — `attachProductImage` only
  ever repointed the single primary, unchanged by this slice.
- **`StorageService.deleteObject`** (GAP-015, #174 partial): removing or replacing a product image
  now deletes the superseded object from storage. Decided inline delete over a scheduled sweep — no
  new infrastructure, `wrangler.toml` still has no cron triggers. Doesn't cover an abandoned upload
  (object written, `ProductImage` row never created) — #174 stays open for that narrower remainder.
  `specs/architecture.md` and ADR-003 updated; both previously documented delete as "deliberately
  absent".

### Docs
- **`/document` pass for the P6.5 residual-validation `/validate` + `/fix` + `/ship` cycle
  (PR #209).** Added the roadmap row recording the actual merge (`74b6d02`) and the `/fix` pass
  that preceded it — the Build-time row predicted the outcome before Ship ran, matching the pattern
  already seen for PR #205/#206. Rebuilt `ARTIFACT_INDEX.md`. Confirmed issue #192's board item is
  `In Review` (not `Done` — merged to `staging` only) and that #208/#176 are correctly placed.
  Recorded a lesson in `specs/sdd-workflow.md`'s Ship section: a PR body referencing an issue that
  must stay open is a closing-keyword trap even in prose that isn't the canonical `Closes #NN`
  form — verify with `gh pr view <N> --json closingIssuesReferences` before merging.

### Fixed
- **Gap-register reconciliation: the registers were wrong on seven of fifteen rows**
  (specs/2026-08-17-p6.5-residual-validation/, issue #192). Two `status: approved` registers were
  sharing one GAP-ID space with no cross-reference — `docs/sdd/self-review/GAP-REGISTER.md` held
  GAP-001..004, `docs/gap-register.md` held GAP-005..015. Consolidated into `docs/gap-register.md`
  as the single master; the P6.5 file keeps its narrative and points there. Every row was then
  re-derived from the code rather than from what the row claimed about itself: GAP-007 cited the
  closed P6b2 upload issue (#167) instead of the open CORS prerequisite (#180); GAP-008, GAP-009,
  GAP-010, GAP-012 and GAP-013 all still read `Deferred` after the work had shipped. **GAP-012 was
  fully built and nobody knew** — `features/orders/reorder-items.ts` is a complete server action
  wired into the order detail page while both the register and issue #124 reported it outstanding.
  GAP-013's rail ships but is populated by an `isHalal` proxy rather than a real featured flag
  (**#208** filed). GAP-014's wording understated what exists (add and set-primary are built;
  remove and reorder are not). The register's "0 P0 (Critical Code/Security) gaps" and "100%
  functionally complete, fully tested, and verified" claims are removed — both were false on the
  day they were written, given P7a's unlisted unauthenticated cross-vendor order-disclosure hole.
- **P6.5's exit gate certified a document instead of the code.** Its `validation.md` R1/R2 asked
  only that the gap register exist and *claim* zero unresolved Critical/High gaps, and its six rows
  were labelled `R1..R6` against a `requirements.md` that had no numbered requirements at all.
  That is the mechanism that let GAP-010 sit as an accounted-for `Deferred` row while staff bulk
  transitions had never been built. Both files rewritten: numbered `R1..R11`, every row now naming
  a command, a file property, or a behaviour to exercise against the artifact.
- **#176 verified fixed and closed**, and `specs/sdd-workflow.md`'s Validate-stage guidance for it
  corrected. The fix had landed as GAP-002 of P6.5, but its only evidence was 26 unit tests — the
  reported symptom was never re-fired, so the issue stayed open and the workflow doc kept telling
  future sessions that local-preview browser sign-in 403s and needed a temporary **uncommitted**
  patch to `lib/auth-origin.ts`. Live-verified against `npm run preview`: `Origin:
  http://localhost:8787` reaches credential checking (`401` on a wrong password) while `Origin:
  http://localhost` correctly returns `403 INVALID_ORIGIN` — **the inverse of what the doc
  documented**, so a validator following it would have called a working app broken. Confirmed from
  a real Chrome session as well (`POST /api/auth/sign-in/email` → `401`). Because the origin check
  runs before credential validation, a deliberately wrong password proves this with no real
  credential involved.

### Docs
- **Backfilled the PR #206 promotion row in `specs/roadmap.md`** (`staging → main`, merge
  `081f618`) — the fifth consecutive promotion to reach production without a change-log row.
  `sdd:audit` checks for a missing *slice* row and structurally cannot see a missing *promotion*
  row; rather than record that observation for a fifth time, it is now tracked as **#207**.
- **`/document` pass for the P7a `/validate`+`/fix`+`/ship` cycle (PR #204).** Backfilled two
  missing promotion rows in `specs/roadmap.md`'s change log — PR #203 (`staging → main`, closing
  P8 operational-debt issues #98/#156/#197) and today's P7a fix (PR #204, merged to `staging`) —
  the same recurring "`sdd:audit` catches a missing slice row, not a missing promotion row" gap
  #144 first named. Corrected the 2026-08-13 P7a-closure row's claim that staff bulk transitions
  had shipped (they hadn't; #162, now actually built). Recorded that issue #123 was closed
  prematurely on 2026-08-13 — accurate now that the guest-lookup fix landed, but the underlying
  feature was broken/insecure at the time it was marked done. Rebuilt `ARTIFACT_INDEX.md`.

### Fixed
- **P7a compliance/hardening: three defects found and fixed at its first-ever `/validate` pass**
  (specs/2026-08-13-p7a-compliance-hardening/). P7a shipped ungated (direct push, no PR, no
  `gates`) on 2026-08-13; this is the first time it was checked against its own spec. Missing
  `Content-Security-Policy` header added to `next.config.mjs`, scoped to the app's actual external
  hosts (per-vendor CDN, R2's presigned-upload endpoint) so image upload wasn't silently broken.
  Staff bulk order transitions (`requirements.md` §4.3/GAP-010, issue #162) were never built
  despite the roadmap claiming otherwise — added `advanceOrderStatusBulk` (one `$transaction` per
  batch, legality re-checked per order against its own persisted status) and wired multi-select
  checkboxes into `/staff/orders` via HTML5's `form=` attribute rather than nested `<form>`s. Guest
  order lookup (`/orders/lookup`) reused `findOrderForWebhook` — documented in its own file as the
  one deliberately un-scoped read in the codebase, meant for Stripe's server calls only — with an
  optional email field, so an order number alone disclosed any order's contents, any vendor, no
  auth, no throttle; this is exactly the gap issue #123 deferred pending a real credential-pair/
  rate-limiting decision, which P7a's own `requirements.md` §4.1 had already settled (Order Number
  + Email) without the implementation enforcing it. Fixed with a vendor-scoped, email-matched query
  (`findOrderForGuestLookup`) and a new Postgres-backed 5/minute rate limiter
  (`OrderLookupAttempt`, additive migration `20260817120702_p7a_order_lookup_rate_limit`) — no
  Cloudflare rate-limiting binding is provisioned, so this reuses existing Neon/Prisma rather than
  inventing infrastructure. All three verified live against real Postgres on staging.

### Docs
- **Backfilled `specs/roadmap.md`'s missing PR #200 promotion row.** `sdd:audit` only checks that a
  roadmap entry cites a `specs/<slice>/` path, so a missing *promotion* row (as opposed to a missing
  *slice* row) goes uncaught — the same class of gap **#144** recorded for P5a. PR #200 (`staging →
  main`, merge `399ecef`) carried PR #195's doc reconciliation plus buckets A/C and the demo-accounts
  fix (#199) to production with no migration; production `/api/health` reconfirmed at `399ecef`.

### Fixed
- **SriMart's `VendorConfig` delivery values re-seeded on staging** (#98): `npm run db:seed` had
  never run with both `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` set against staging, so SriMart's
  delivery fee/threshold/minimum sat on `VendorConfig`'s schema defaults (£3.49) instead of the
  vendor-specific values already written in `prisma/seed.ts` (£2.99, free over £50, £10 minimum).
  Re-ran the seed with both host vars set; verified live against staging Postgres —
  `deliveryFeePence: 299, freeDeliveryThresholdPence: 5000, minimumOrderPence: 1000` — confirming
  SriMart's checkout now renders its own values, not Aheed's/the schema default's. No code change;
  a live data operation, recorded here per Gate 4.

### Docs
- **ADR-004 schema-drift check closed** (#197, split from #65): `prisma migrate diff
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` run against a
  throwaway local Postgres shadow database (Docker, discarded after) reported "No difference
  detected" — the hand-authored `20260808130000_multitenancy_vendor_scope` migration exactly
  matches `schema.prisma`. No reconciling migration needed. Recorded in ADR-004's implementation
  breadcrumb.

### Added
- **`demo-srimart-admin@example.com` in the demo-accounts roster** (#141): a store admin on the
  platform's second vendor (SriMart), needed to close P5a's R56 gap — every other vendor-role demo
  account attaches to the same (first ACTIVE) vendor, so a cross-vendor write could only ever be
  tested in one direction. `DemoAccount` gains an optional `vendorSlug` field (omitted = existing
  "first ACTIVE vendor" default) so an account can target a specific second vendor.
  R56's reverse leg verified live against staging with a repository-level check
  (`vendorConfig.update({ where: { vendorId: <srimart-id> }, ... })` leaves Aheed's row's
  `updatedAt` untouched) rather than an interactive browser sign-in, which isn't something the
  assistant can do itself even for a non-sensitive demo account — see
  `specs/2026-08-11-p5a-loyalty-points/validation.md`'s R56 row.

### Added
- **`sdd:preclear` now checks `ARTIFACT_INDEX.md` staleness** (#132), mirroring `gates.yml`'s own
  check so it can't surface for the first time on an open PR — P4b lost a CI run and a fix commit to
  exactly that. Rebuilds the index into memory, diffs it against what's on disk with the generated
  timestamp/commit footer normalised out, and restores the original bytes when the only difference
  is that footer, so a footer-only rebuild doesn't masquerade as real uncommitted work for the
  clean-tree check. Found and fixed a bug in its own first version while testing on Windows: a
  `core.autocrlf` checkout holds `\r\n` on disk while `kms:build-index` always writes `\n`, so the
  raw byte compare needs line endings normalised too, not just the footer text.

### Docs
- **The multi-issue `Closes #a, #b, #c` GitHub limitation** (#112): GitHub only honours the closing
  keyword for the first issue in a comma-separated list, silently leaving the rest open on merge.
  Documented in `specs/sdd-workflow.md`'s Ship section and `.claude/commands/ship.md` — promotion
  PRs are exactly where this bites, since slice PRs merge into `staging` (never the default branch),
  deferring every issue closure to the promotion PR.

### Removed
- **Eleven orphaned debug scripts** (#191): five ad-hoc Puppeteer scripts at the repo root
  (`parse-logs.js`, `test-action.js`, `test-checkout.js`, `test-local.js`, `test-staging.js`) and six
  more under `tests/regression/`, none referenced by any workflow, `package.json` script, test
  config, or source import. The two regression scenarios they exercised (rapid cart mutation,
  checkout-cancel cart restoration) are already covered as a manual register in
  `docs/regression-tests.md`, verified live on staging during P6.7's closeout. `puppeteer` removed
  from `package.json` — these scripts were its only consumer in the repo.

### Docs
- **ADR-004**: added an implementation-status breadcrumb for slices 0–1 (Neon environment isolation,
  the `Vendor` aggregate + `vendorId` migration), both shipped to production 2026-08-08. One
  follow-up item from #65 remains open and un-narrowed to just that: independently verifying the
  hand-authored migration has no Prisma schema drift.

### Added
- **`demo-store-admin@example.com` in the demo-accounts roster** (#190): a store admin — vendor
  `ADMIN`, platform `CUSTOMER`. This role was previously impossible to represent:
  `requireVendorRole()` short-circuits to `via: "platform-admin"` for any platform `ADMIN`
  (`lib/auth-rbac.ts`), so `demo-admin`'s `vendorRole` is never read, and the three guards that only
  fire for `via: "ADMIN"` (`roles.ts:42`, `roles.ts:64`, the self-lockout branch) had unit coverage
  but had never run against a real session. `tests/demo-accounts.test.ts`'s roster assertions now
  derive from `DEMO_ACCOUNTS` instead of hardcoding its size and shape.

### Docs
- **P6.7 closed out** (#186, `specs/2026-08-17-p6.7-closeout-promotion/`): walked `validation.md`
  §1.1–§1.4 and §2 live on staging across four accounts — all 29 rows now checked off with the
  observed result recorded against each. Both hierarchy refusals, the STAFF denial and both
  self-lockout variants hold; the store admin's role selector omits `ADMIN` from the DOM entirely,
  and injecting the option server-side is still refused. The audit trail wrote **6 rows for 6
  successful writes and 0 rows for the 4 refusals**, confirming the guards run inside the
  `$transaction`. Smoke-checked P6.6/P6.6c/P7a and the #187 cart/checkout paths ahead of promotion;
  P6.5 and a live order status transition are recorded as deliberately not covered.
- **`specs/Validation.md` → `docs/regression-tests.md`**: given KMS front-matter and moved out of
  `specs/`, where it had no front-matter, never reached `ARTIFACT_INDEX.md`, and collided by name
  with every slice-local `validation.md`. Both of its regression scenarios were re-verified on
  staging and are annotated with the result.
- **Roadmap corrections**: the P6.5 row cited "Issue #180" (an unrelated CORS issue) and the P7a row
  cited "PR #183" (an issue number, and no PR carried P7a). Both now record that the slice shipped
  by direct push with no anchoring issue, naming the actual commits `982eafb` and `624a842`.
- **Board reconciliation**: #183/#184/#187 → In Review; **#185 corrected from Done → In Review**
  (its fix was never promoted, so it was not in production); #176 → Backlog; added a draft item for
  P6.6, which shipped via PR #182 with no issue and no board presence.
- Filed **#191** — eleven orphaned debug scripts still tracked from the ungated period.

### Docs
- **P6.7 closeout — Document (final)**: corrected `specs/roadmap.md`'s 2026-08-17 closeout row,
  which had recorded promotion to production as already done — it was written during Build, before
  the promotion PR existed. Added the real promotion row: **PR #194**, merge `7c9409c`, 56 commits
  (not the 51 `plan.md` estimated pre-Ship), `deploy-production` green, production `/api/health`
  confirmed `db.ok: true`. Board reconciled to match: #183/#184/#185/#187 and the P6.6 (PR #182)
  draft item moved to **Done** — all four fixes were confirmed inside the promoted commit range, so
  "In Review" (PR #193's placeholder, written before promotion) was no longer accurate. #186/#190
  closed on the `main` merge. **Process lesson recorded in `specs/sdd-workflow.md`**: a slice's own
  `validation.md` should never check `ARTIFACT_INDEX.md` staleness with a bare
  `git diff --exit-code` — the footer embeds `git rev-parse HEAD` at generation time, so a committed
  index can only ever cite its own parent commit, and a bare diff will show that one-commit gap
  forever, by construction. CI's `gates.yml` normalizes the footer away before comparing; P6.7's
  `validation.md` didn't, so `/validate` reported a false failure and `/fix` spent a harmless-but-
  unnecessary commit chasing it.

### Docs
- **P6.7 Document (final)**: rebuilt `ARTIFACT_INDEX.md` (P6.7's `plan.md` was missing KMS
  front-matter, so the slice was invisible to `sdd:audit`'s index check — added it); added the
  2026-08-17 roadmap closure/status row recording what PR #188 actually verified vs. what's still
  open (live multi-role validation, promotion to `main`); reconciled `validation.md` to check off
  §3's now-real automated coverage while leaving §1/§2 explicitly unverified rather than silently
  passing; reopened issue #186 (closed prematurely on staging, before review) and set its board
  status to In Review; recorded the ungated-direct-push pattern in `specs/sdd-workflow.md`'s Orient
  section so the next session checks `gh pr list` against the commit range, not just divergence
  counts.

### Fixed
- **P6.7 Validate pass — self-lockout race, missing test coverage, and branch-wide gate breakage**:
  - `lib/repositories/roles.ts`: closed a TOCTOU race in the last-admin self-lockout guard — the
    admin count and the demoting write now run inside the same `$transaction` at `Serializable`
    isolation, so two concurrent self-demotions can no longer both pass the check and leave a
    vendor with zero admins.
  - Added `tests/roles.test.ts` (12 tests) covering the role-transition matrix `validation.md` §3
    asked for, plus the self-lockout guard.
  - Corrected `validation.md`'s "403 Forbidden" wording to match how a Next.js Server Action
    actually reports a refusal (`{success:false, error}` on a normal response, not a route
    handler's HTTP status).
  - Removed the leftover diagnostic try/catch wrapper in `checkout/page.tsx` and
    `categories/page.tsx` (23 lint errors) now that the connection-exhaustion bug it was added to
    diagnose is fixed elsewhere; deleted a stray UTF-16-encoded scratch file (`test-cart.ts`) that
    broke `lint`/`format:check` outright; fixed a stale `tests/payments.test.ts` assertion left
    over from the checkout-cancel-routing fix; reformatted the remaining root-level scratch
    scripts flagged by `format:check`.

### Added
- **Promo Slider & UI Animations**: Added a new `PromoSlider` component to the homepage to showcase the latest offers. Enhanced the overall visual impact with subtle animations (hover translations, shadows, and scaling) across the `ProductCard`, `DepartmentScroller`, and homepage trust sections.
- **Validation Guidelines**: Added a manual regression register tracking test cases for critical system logic including the hybrid Prisma driver architecture and cart persistence, preventing regressions. (Originally added as `specs/Validation.md`; moved to `docs/regression-tests.md` with front-matter during P6.7's closeout.)
- **P6.7 — Staff Team & Role Management**:
  - Built a new `/staff/team` interface for managing staff members within a vendor organization.
  - Added a backend integration allowing STORE_ADMIN users to assign `STAFF` and `STORE_ADMIN` roles to existing users.
  - Created `VendorRoleAuditLog` to persistently track all role elevation actions with attribution (`grantedBy`).
  - Implemented `lib/repositories/roles.ts` to enforce RBAC and safe role updates.

### Fixed
- **Checkout Form Persistence**: Contact details on the checkout form now persist using local storage to survive the navigation flow when returning from payment.

### Fixed
- **Cloudflare Staging React Error #441 / Intermittent 500s (Connection Exhaustion / HTTP Transaction Error)**:
  - Deployed a hybrid Prisma driver strategy in `lib/db.ts` to solve both WebSocket connection exhaustion on Cloudflare isolates AND the "Transactions are not supported in HTTP mode" error.
  - `getPrisma()` now uses the fetch-based `PrismaNeonHttp` adapter for 99% of read operations, bypassing Cloudflare's WebSocket limit.
  - `getPrismaWs()` uses the WebSocket-based `PrismaNeon` adapter strictly for operations requiring `$transaction` (e.g. checkout, add to cart). This ensures we only open a WebSocket exactly when an interactive transaction is required, keeping the concurrent socket count well below Cloudflare's strict 50-per-isolate limit.
- **Cloudflare Staging React Error #441 (Tag Cache)**:
  - Fixed `addToCart` Server Action crashing during OpenNext revalidation phase.
  - Replaced `revalidateTag("cart")` with `revalidatePath("/", "layout")` in `features/cart/shared.ts` to bypass OpenNext tag cache missing binding issues on Cloudflare Workers.

### Fixed
- **Storefront & Admin Accessibility / Contrast Audit**:
  - Restored WCAG 4.5:1 text color contrast on product unit labels (`text-black/60`), original prices (`text-black/60`), and the 'Filters' side navigation title (`text-primary`).
  - Darkened dashboard notification text and card descriptions in the staff portal (`app/(admin)/staff/page.tsx`) from `/60` and `/70` to `/80` opacity.
  - Increased footer contrast on all storefront pages by removing `/70` opacity on the footer element.
  - Swapped the 'Apply' button background on the filtering form from `#4CAF50` (which failed contrast ratios against white text) to `#2E7D32`.
  - Added a visually hidden `<h2>Products</h2>` inside the product grid to establish a semantic heading sequence for the category pages (`H1` -> `H2` -> `H3`), preventing skipped heading levels.
  - Added explicit `aria-label`s to the quantity increment/decrement buttons in `AddToCartButton.tsx`.
  - Wrapped main action controls and navigational links in the `<Header>` component inside a `<nav aria-label="Main Navigation">` landmark.
- **Navigation RSC 404 Pre-fetch Error**: The 'Help Guide' link in the top navigation bar was pre-fetching `/help` in the background, which does not exist, triggering a fatal `404 (Not Found)` RSC error that halted client-side navigation. Re-pointed the link to `#` until the help page is implemented.
- **Next.js 15 Client Transition 500 Errors (#184)**: Resolved `ERROR 2745569299` hard crashes in the Admin/Staff portal when toggling tiers or navigating client-side. Next.js 15 enforces strict rules that were previously warnings:
  - Missing `<Suspense>` bounds around `useSearchParams()` now throw fatal server errors on RSC fetches. Wrapped `InventoryTable` at `/staff/inventory` in `<Suspense>`.
  - `params` and `searchParams` are now asynchronous Promises. Components returning early (e.g. `requireVendorRole` failing and returning `<PanelRefusal>`) without awaiting these promises triggered unhandled serialization errors. Systematically moved `await params` and `await searchParams` to the top of all `app/(admin)/staff/...` pages.
  - Implemented systematic null-safety across `lib/repositories/products.ts` resolving intermittent 500 errors.
- **Cloudflare Worker CPU Execution Limit**: Set `[limits] cpu_ms = 50` in `wrangler.toml` to prevent Error 1102 ("Worker exceeded resource limits") during Next.js RSC cold starts on category pages.
- **Transactional Email Strategy (GAP-005)**: Flagged migration to native Cloudflare Email Sending (outbound) and Email Routing (inbound) under Workers Paid ($5/mo) for Phase 8, replacing Resend and expanding CPU execution headroom.

### Added
- **P6.6c — Staff/Admin Operations Views Completion**:
  - Refactored `PanelNav` to include all missing tabs (Reports, Inventory, Categories, Discounts, etc.) and enabled horizontal scrolling for mobile devices.
  - Injected missing dashboard portal cards for "Live Inventory", "Runbook", and "Reports" (Admin only) on the main Operations dashboard.
  - Built a zero-trust, static Operations Runbook (`/staff/runbook`) based on the UI-ref spec.
  - Built an Admin-only financial Reports dashboard (`/staff/reports`) computing live metrics (Total Revenue, Total Orders, Average Basket Value) via a new Prisma aggregate query in `OrderRepository`.
- **P6 Missing Gap (Issue #168)**: Shipped a dedicated "Live Inventory & Availability" view tailored for shop-floor staff. This includes dynamic tier toggling between Staff and Admin views, tabbed navigation, client-side filtering, and optimistic mutations for quick stock adjustments and availability toggles. Resolves a previously deferred P6 requirement and aligns perfectly with the AI Studio mockup.
- **P6.6 — P0 Core Shopping UI Overhaul** (`specs/2026-08-13-p6.6-p0-ui-overhaul/`):
  Full UI redesign mapping to the `docs/ui-ref` prototype while maintaining the `VendorConfig` multi-tenancy constraints.
  - **Header & Cart Drawer**: Added delivery promise strip, global search UI, dynamic brand logo rendering, and a styled cart drawer button displaying the total price.
  - **Hero & Trust Strip**: New storefront landing page (`page.tsx`) with a dynamic gradient Hero banner, real postcode checking, and Trust Values row.
  - **Product Discovery**: Converted static placeholder text into live, data-driven "New Arrivals" and "Featured Halal Deals" merchandising rows.
  - **Product Card Flow**: Overhauled visual card styling (badges, discount display, layout) and added an inline quantity selector directly into `AddToCartButton` to satisfy the requested Image → Title → Pack Size → Price → Offer → Qty Selector → Add to Cart UX flow without introducing complex client state.
- **P7a — UK compliance, operational gap closure, and UX hardening** (`specs/2026-08-13-p7a-compliance-hardening/`):
  Delivers UK GDPR/PECR compliance, OWASP edge security headers, guest order tracking, slide-over cart drawer, staff bulk order transitions, and one-click reordering.
  - **UK GDPR & PECR Cookie Consent**: `CookieBanner.tsx` component managing essential/optional cookies with host-scoped `aheed_cookie_consent` cookie. Legal Terms of Service (`/terms`) and Privacy Policy (`/privacy`) pages.
  - **OWASP Security Headers**: Injection of HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection` in `next.config.mjs`.
  - **Guest Order Lookup**: `/orders/lookup` page allowing unauthenticated guest shoppers to track orders via Order Number + Email.
  - **Slide-Over Cart Drawer**: `components/cart/CartDrawer.tsx` matching `docs/ui-ref` design mockup visual look and feel.
  - **One-Click Reorder**: Reorder items Server Action on `/account/orders/[orderNumber]` page.
- **P6b2 — product image upload via presigned PUT** (#167,
  `specs/2026-08-12-p6b2-image-upload/`): P6's last slice, and the first time an admin can put a
  real photograph on a product. P6b1 made every *field* editable and left images read-only, so the
  only way to change one was a developer re-running `prisma/seed.ts`. Three capabilities the
  project has never had land together: the **first write through `lib/storage`** at runtime, the
  **first request the Worker has ever signed**, and the **first browser-direct upload**. The Worker
  signs a short-lived `PUT` (`presignPut`, SigV4 query signing via aws4fetch — still plain S3, no
  R2 feature) and the browser uploads **straight to storage**, so no image byte transits the Worker
  and its request-size and CPU limits are not in the upload path. **Keys are immutable —
  `products/{productId}/{uuid}.webp`** — so replacing an image writes a *new* object and repoints
  the row rather than overwriting: that keeps a Cloudflare cache purge out of the design entirely,
  which would otherwise have meant a purge-scoped API token as a new Worker secret and a
  provider-specific call inside a deliberately vendor-agnostic port. Keying on the product id
  rather than the slug survives the slug edits P6b1 made possible. **The server never accepts a
  key**: `requestImageUpload` takes a product id and a byte length and nothing else, because a
  signature proves *who is asking*, never *what they may ask for* — a client-named key would let
  one vendor's admin obtain a valid signature for a PUT over another vendor's object. **The row is
  written only after the object is verified**: `attachProductImage` re-runs the ADMIN check and the
  vendor-scoped product lookup, re-checks the key shape against that product, then issues a
  server-side `headObject` (must exist, be `image/webp`, be within 2 MiB) before anything changes,
  since a presigned PUT cannot police a body it never sees. Bytes are written before the row
  deliberately — the reverse order risks a row pointing at an object that was never uploaded, a
  visibly broken product page, where this order risks orphaned bytes, which are invisible. The
  browser converts to **WebP on a canvas** (1200px longest edge, quality 0.82, EXIF orientation
  honoured) because the Worker never sees the bytes and so cannot; the `.webp` convention now holds
  literally rather than by hope. **No schema change, no migration** — `ProductImage` has carried
  `storageKey`/`alt`/`sortOrder`/`isPrimary` since P2. Scope is the **primary image only**:
  add/remove/reorder is #173, and **nothing is ever deleted**, so superseded objects accumulate by
  design (#174). Corrects four docs that all gave the example key as `products/{sku}/main.webp` —
  `Product` has no `sku` field and never has, and the seed actually writes
  `products/{slug}/main.svg`; ADR-003 gains an additive implementation note recording the port's
  real methods, the aws4fetch-vs-AWS-SDK substitution and the immutability rule, reopening no
  decision. Staging bucket CORS applied and verified during the slice; **production CORS is
  deliberately deferred to the promotion**.
- **P6b1 — catalogue management: product, category & inventory writes** (#159,
  `specs/2026-08-12-p6b1-catalogue-writes/`): the first admin **write** path to the catalogue.
  `lib/repositories/products.ts` and `categories.ts` were read-only — every exported method a query
  — so products, categories and inventory existed only because `prisma/seed.ts` created them, and
  the owner could not add a product, correct a price or mark something out of stock without a
  developer and a re-seed. Product and category **create + edit** plus inventory editing now live
  inside P6a's `(admin)` panel at `/staff/products` and `/staff/categories`, ADMIN-only, matching
  `/staff/loyalty` and `/staff/discounts`. **No schema change and no migration** — every field
  written already existed; what was missing was never the columns. Admin routes key on **`id`, not
  `slug`**, because this slice makes a slug editable for the first time and an admin URL that
  changes when you rename the thing it points at breaks every bookmark. **Admin reads are separate
  functions, not a flag on the storefront's** — every storefront read filters `isActive: true`,
  which is right there and fatal here, since the owner's first need after hiding a product is to
  find it again; an `includeInactive` boolean in the storefront hot path would leak hidden products
  to shoppers on one wrong call. **`categoryId` is untrusted**: `Product.categoryId`'s foreign key
  carries no vendor, so a write resolves the category *scoped to the acting vendor* and refuses
  otherwise — the same defence P3d used for its review-form product ids. Every field rule is pure
  and DB-free in `lib/catalogue-form.ts` (28 unit tests), including slug derivation from the name
  and the rule that a "was" price must be strictly above the price it advertises a saving against.
  **Nothing is deletable** — `isActive` is the only removal, for both models: `Product` is
  referenced by `OrderItem`, `CartItem` and `Review`, so a hard delete would either fail on the
  foreign key or destroy order history (same posture P5b took for discount codes). **Deactivating a
  category with active products or sub-categories is refused, naming the blockers**, rather than
  cascading — one click quietly rewriting rows the owner never saw is the wrong default with no
  undo. **A category's parent must itself be top-level**, capping the tree at the two levels the
  storefront can actually render and making a cycle unrepresentable; recorded in
  `specs/architecture.md` (1.12.0) beside the model, since the schema's self-relation is unbounded.
  Creating a product creates its `Inventory` row in the same transaction, and updates upsert it, so
  "out of stock" and "never given stock" stop being indistinguishable. `isUniqueViolation` extracted
  to `lib/repositories/prisma-errors.ts` and shared with `discounts.ts` — slug collisions become a
  routine human error once a person types slugs. Product image upload is deliberately **not** here:
  it is #167 (P6b2), the only part of P6b that is new infrastructure and the only part blocked on
  owner-provisioned bucket CORS and Worker `S3_*` secrets; the form shows existing images read-only
  and `lib/storage.ts` is untouched. Also deferred with issues filed: a STAFF-visible stock-only
  surface (**#168**) and search on the admin product list (**#169**).
- **P6a — admin panel shell & order dashboard** (#158, `specs/2026-08-12-p6a-admin-shell-orders/`):
  the first P6 slice. Before this, `/staff/orders`, `/staff/loyalty` and `/staff/discounts` were
  three orphan pages with no index, no navigation between them, and the *shopper's* header rendered
  above each — reachable only by typing the URL. A new **`app/(admin)/` route group** with its own
  layout makes them one navigable panel; route groups are URL-invisible, so **every path is
  unchanged**. The new layout re-carries the two things the storefront layout had been silently
  providing: the **ADR-004 slice 3b tenant gate** (`getCurrentVendorId()` *throws* on an
  unresolvable host, so a layout without the `/coming-soon` redirect turns an unknown host into a
  500 — `specs/architecture.md` now records the gate as a per-layout obligation, not a property of
  one file) and the **slice 4 brand tokens**, extracted to `lib/vendor-theme.ts` so two layouts
  cannot drift apart on the same palette. The layout's role lookup drives **navigation only** — a
  layout is not an authorization boundary in the App Router, so every page still calls
  `requireVendorRole` with its own roles and every action re-checks independently. Adds a `/staff`
  landing page. **The order dashboard supersedes P4b's deliberate stopgap** (#129): with no query
  string it is still *exactly* P4b's actionable queue — the packing floor's default does not move —
  while `?status=` (including `?status=all`) and `?q=` reach the rest, so a delivered order from
  last week is findable at all. An absent **or unrecognised** status both fall back to the queue
  rather than widening it, and the pagination link carries the **normalised** value, never the raw
  input, so a typo cannot propagate through paging; all of it lives in a pure, DB-free
  `lib/staff-orders-query.ts`. Search spans order number, guest email and a member's email.
  **A per-order detail view at `/staff/orders/{orderNumber}`** — the first staff have ever had —
  served by `getForStaff()`, a **third** order read beside `getByOrderNumber` (P3b's capability-URL
  rule) and `getForUser` (P4a's owner-only rule) and deliberately neither: vendor-scoped, *not*
  owner-scoped, so a guest order with no owner is visible to the staff who must pack it while
  another vendor's number resolves to nothing. It is the **first reader of
  `OrderStatusEvent.createdByUserId`**, which P4b shipped with nothing able to display it.
  **P4a's no-note guarantee is preserved structurally rather than by filtering**: `buildTimeline`
  and `StatusEventInput` still have no `note` field at all, and the staff view gets its own builder,
  its own entry type and its own repository select — so a note reaching a shopper's order page would
  require changing three things, not forgetting one. Unlike the customer timeline it does **not**
  collapse consecutive identical statuses, because for staff that repeat is the diagnostic
  information. `STAFF_QUEUE_STATUSES` moved to `lib/order-status.ts` (it was always a status rule,
  not a data-access concern) so the pure parser can reach it without importing a repository.
  **No schema change and no migration** — `Order`'s `@@index([vendorId, status, createdAt])` from
  P3b already serves every list here. Deliberately excluded and tracked: catalogue management
  (#159, P6b), bulk order actions (#162), and search indexing for real volume (#163); staff
  cancellation and refunds remain ADR-005 territory. `docs/repo-structure.md`'s app-tree sketch,
  which showed an `(admin)/admin/` group that was never built, corrected to the `(admin)/staff/`
  group that now exists.
- **P5b — discount codes: engine, checkout application & staff admin** (#145,
  `specs/2026-08-11-p5b-discount-codes/`): P5's second slice and the discounts half of the phase.
  Per-vendor `PERCENTAGE`/`FIXED_AMOUNT` codes with a validity window, minimum spend, a global usage
  cap and a per-customer cap; entered at checkout, created and deactivated at `/staff/discounts` by
  a vendor ADMIN. **P5a's generic `Order.discountPence` paid off exactly as designed**: `computeTotals`
  already took a discount parameter, so `lib/payments.ts`, `/api/webhooks/stripe` and `Order` itself
  are untouched, no ADR-005 decision is reopened, and `eligibleSpendPence` already excluded the whole
  discount from earning — so a code-discounted order earns fewer points with **no new code**, and
  codes cannot become a points-farming loophole. **Codes and points stack, code first**: the code is
  evaluated against the pre-discount subtotal (a percentage must not shrink because points were also
  spent) and `clampRedemption` gained an optional `existingDiscountPence` (default `0`, so every P5a
  case passes unmodified) so points fill only the remaining headroom above the 30p payment floor.
  **The usage counter counts DOWN** — `remainingRedemptions`, nullable for unlimited — because
  `usedCount < maxRedemptions` is a column-to-column comparison Prisma cannot express in a `where`
  and raw SQL is forbidden in application code; counting down restores the literal-to-column guard
  `Inventory.quantity` (P3b) and `balancePoints` (P5a) already use, and `NULL` arithmetic keeps an
  unlimited code unlimited with no branch. **The per-customer cap is structural, not a
  count-then-write race**: `DiscountRedemption.seq` under `@@unique([codeId, userId, seq])` means two
  concurrent claims by one shopper both compute `seq 0` and the database refuses the second. **An
  abandoned checkout gives the use back** — `releaseOrder` releases the code beside the points
  reversal, or a 100-use launch code would die without a single paid order; that release **deletes**
  the redemption row rather than writing a reversal, deliberately unlike the loyalty ledger, because
  nothing financial happened and deleting frees the shopper's `seq` slot. **An unusable code fails
  the checkout with its reason**, the opposite of P5a's treatment of an unparseable points value:
  silently charging full price for an order the shopper believes is discounted is the worse failure.
  One additive migration (two tables, one enum); no column added to `Order`. Deliberately excluded
  and tracked: category-scoped codes (#146), auto-applied promotions (#147), multiple codes per
  order (#148), first-order-only eligibility (#149), naming the applied code on order pages and in
  the email (#150), and code-use reversal on refund (#151, unreachable today for the same structural
  reason as #137). P5 does **not** close on this slice's promotion — **#143** must be resolved first,
  since P5a is live in production but dark.

### Fixed
- **P6a closeout docs.** `specs/roadmap.md` (1.18.0) gains P6a's slice row and its promotion row,
  written from what live validation actually proved: **every one of build-notes' "known-shaky"
  areas came back clean**, most notably the search `where`'s `user.email` relation-filter leg
  (17 real matches through the relation, not the scalar legs) and `mode: "insensitive"` both proven
  against the real Neon driver adapter for the first time, and the advance-status Server Action
  driven end-to-end through a genuine rendered `multipart/form-data` form. No defect found in the
  artifact; two apparent test failures during validation traced back to the validation harness
  itself (an `Origin`-header mismatch on a hand-built Server Actions POST; a literal-string check
  that missed a React hydration comment). **P6a promoted** (PR #165, merge `035fa69`), carrying
  P5's still-unpromoted closeout (#157) along with it — no migration, the simplest promotion of the
  phase so far. P6 stays **open**: P6b (#159, catalogue management) is next.
  `specs/sdd-workflow.md` (2.6.0) **corrects the model-switch point**: the loop had the switch to
  Opus 5 landing right after Ship, so Document (final) — reconciliation work against a branch the
  current session already has full context on — ran on a freshly-switched, cold Opus 5 session that
  then spent tokens re-orienting to do work that didn't need Opus's extra reasoning. The switch now
  sits at the *end* of Document (final), immediately before the second `/clear`, so Document runs on
  the already-warm model and the next loop's Orient starts already on Opus 5. `CLAUDE.md` and the
  `/ship`/`/document` command files updated to match.
- **P6b1 closeout docs.** `specs/roadmap.md` (1.19.0) gains P6b1's slice row and its promotion row.
  A real defect was found and fixed **before** the slice ever reached `staging`: the write path's
  `"use server"` file (`features/admin/catalogue.ts`) also exported a plain object
  (`initialCatalogueState`) alongside its two actions, and Next validates a `"use server"` file's
  *entire* export set together whenever any one action dispatches — so every product/category write
  500'd, for any caller, with `next build`/`tsc`/`npm test` all staying green throughout (none of
  them load the module through the flight-loader's runtime dispatch path). Only `npm run preview`'s
  live write rows caught it. Fixed by moving the constant into `lib/catalogue-form.ts`; re-validated
  live in full afterward, with every write-path requirement re-proven against real Postgres on
  staging rather than just re-read. `CLAUDE.md` (1.1.0) gains a new "Server Actions" section
  recording the trap so it isn't rediscovered. **P6b1 promoted** (PR #171, merge `a577697`),
  carrying P6a's still-unpromoted Document-final closeout (#166) along with it — no migration. P6
  stays **open**: P6b2 (#167, product image upload) is next.
- **P6b2 closeout docs — P6 closed.** `specs/roadmap.md` (1.20.0) gains P6b2's slice row, its
  promotion row and a phase-closure row: all three P6 slices (P6a #158, P6b1 #159, P6b2 #167) are now
  live in production. All 32 `validation.md` rows pass, including a full real-browser end-to-end run
  (EXIF-upright confirmation, exact 1200×900 downscale, zero CORS/console errors, CDN fetch of the
  resulting key). Two real defects found and handled during this slice's Validate: `validation.md`'s
  own R26 fixture script named the wrong vendor slug and built a `PrismaClient` with no driver
  adapter (both would have made the script throw as originally written — fixed in `ddaf30a`,
  **before** `staging`), and a pre-existing, unrelated bug in `lib/auth-origin.ts` that 403s
  real-browser sign-in against `npm run preview` on any non-default port — filed as **#176**, not
  fixed here (staging/production are unaffected; default port, Cloudflare sets `x-forwarded-proto`
  correctly there). `specs/sdd-workflow.md` (2.7.0) records #176 in the Validate stage so it isn't
  rediscovered. `CLAUDE.md` (1.2.0) records the Windows `npm run preview` orphaned-process trap
  (`workerd.exe`/`wrangler dev`'s children survive the parent's termination, causing `EBUSY` on the
  next build) hit twice during this slice's live-browser Validate. **P6b2 promoted** (PR #178, merge
  `2f8ae5b`) — no migration. **One prerequisite the promotion does not carry**: production's
  `aheed-images-production` bucket CORS is deliberately not applied yet (owner action, tracked in
  `plan.md`'s Prerequisites), so uploads will 403 in production until it's set.
- **The order confirmation email and order-detail pages labelled the combined discount line "Loyalty
  points" unconditionally**, unchanged from P5a — so as of this slice, an order discounted by a code
  alone (no points touched) rendered a line claiming the shopper's loyalty balance had been spent.
  The arithmetic was always correct (`subtotal - discount + delivery = total` held either way); only
  the label was wrong. Found at this slice's Validate. Relabelled to "Discount" in both
  `features/checkout/send-confirmation.ts` and `components/orders/OrderItemsCard.tsx` (shared by
  `/checkout/{orderNumber}` and `/account/orders/{orderNumber}`); `tests/order-confirmation-email.test.ts`
  updated to assert the new label.
- **P5b closeout docs.** `specs/roadmap.md` (1.16.0) gains P5b's slice row, written from what live
  validation actually proved: **every one of build-notes' eight "known-shaky" areas came back
  clean**, most notably both concurrency guarantees (the global usage-cap race and the per-customer
  race) actually running under `Promise.all` against real Postgres, and the admin cross-vendor
  replay proven in **both directions** — closing, for discount codes, the exact gap **#141** recorded
  for P5a's loyalty config. P5 stays **open**: **#143** (P5a live but dark) must resolve first.
- **P5 closeout.** P5b promoted to production (PR #155, merge `1b66bdf`); unlike P5a's promotion,
  `deploy-production` applied a genuinely pending migration (`20260811175844_p5b_discount_codes`),
  confirmed from the deploy log rather than inferred from a green merge. **#143 resolved**: production
  re-seeded for Aheed only (`SEED_SRIMART_HOST` deliberately unset, so SriMart's block never ran) —
  `loyaltyEnabled: true`, Silver/Gold tiers, and `WELCOME10` all confirmed live by direct read, not
  assumed from the seed's exit code. **P5 (#88) closes here**: loyalty and discounts are now both live
  *and reachable*, which neither promotion alone achieved. Two new gitignored-file defects found and
  filed, not fixed in this diff: **#154** (`secrets/production.vars`' `CDN_BASE_URL` held staging's
  host — fixed by the owner before the re-seed ran) and **#156** (`RESEND_API_KEY`'s malformed `=`
  spacing broke plain-bash `source`, briefly printing the key to a terminal).
  `specs/sdd-workflow.md` (2.5.2) gains a fourth Validate trap: a Next.js server action's id is a
  stable build-time hash in `.next/server/server-reference-manifest.json`, independent of any
  session — which is what let this slice's admin RBAC rows (no-`Cookie`, wrong-role) be driven live
  **without** a valid session to render the form first. `specs/2026-08-11-p5b-discount-codes/validation.md`'s
  C6 fixture corrected in place (matching P4a's R27 precedent): it was described as sharing C1's
  code string, which directly contradicted R48's own premise that C6 exists on no other vendor —
  found and fixed at this pass, not carried forward as a live defect. **#144** (P5a's promotion-row
  backfill) closed — confirmed landed on `staging`. **#141 commented, not closed**: the account
  blocker it named turns out to be avoidable (a platform `ADMIN` transcends vendor membership, so no
  dedicated SriMart-admin account is needed), but it names P5a's `/staff/loyalty` action
  specifically, which this slice's validation didn't re-run.
- **P5a closeout docs.** `specs/roadmap.md` (1.14.0) gains P5a's slice row, written from what live
  validation actually proved rather than what the build expected. It **supersedes
  `build-notes.md`'s "nothing in this slice has touched a real database"** — honest when written,
  and exactly what aimed validation at the right places: all 65 rows were then walked against real
  Postgres and **seven of the notes' eight "known-shaky" areas came back clean**, including the one
  that mattered most (the double-spend guard survived a genuine `Promise.all` race with one winner,
  one `REDEEM` and a balance that never went negative — the unit test had only ever simulated a lost
  race by hand). The eighth stands: **#104** still blocks any inbox-level email proof. P5 stays
  **open** — P5b (discounts engine) is the remaining slice, so there is no phase-closure row here.
- **A real environment defect, found by validation and unrelated to the slice.** `.env` *and*
  `.dev.vars` both pointed at the **production** Neon project while `S3_BUCKET`/`CDN_BASE_URL` in
  the same files correctly said staging — so nothing looked wrong, the documented "check both"
  passed cleanly, and P5a's migration reached production ahead of its promotion PR. Additive and
  verified harmless (row counts unchanged, every `discountPence = 0`, no drift), but the identical
  slip against a destructive migration would not have been. **`CLAUDE.md` now requires diffing
  `.env`/`.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`, not merely
  against each other** — two files agree on the wrong target as easily as they disagree. **#119**
  updated: its framing described only half the failure mode, and its closing criteria should widen
  from "make the two files agree" to "make the target unambiguous". Recorded for the upcoming
  promotion: `deploy-production` will report **no pending migrations**, which is expected, not
  drift (same situation PR #108 logged for P3).
- **`specs/sdd-workflow.md` (2.5.0) — `gh pr checks` is a view, not the truth.** During P5a's
  promotion (#140) a `gates` run showed every step green including `Complete job`, while the job's
  status stayed `in_progress` and `gh pr checks` reported `pending 0` for **56 minutes**;
  `gh run cancel` returned `HTTP 500`. The run had actually succeeded in ~1 minute.
  githubstatus.com showed **Actions "Operational"** alongside a separate active **API Requests /
  GraphQL** degradation — status finalisation rides that degraded path, so Actions' own badge stays
  green while its reporting is broken. The Ship stage now says to cross-check a long "pending"
  against `gh run view --json status,conclusion`, and to read **every** status-page component
  rather than only Actions: an `until ! gh pr checks | grep pending` loop can spin forever on a
  finished run, and "still pending" is not evidence a job is still working. The same incident also
  silently dropped a delivery-board write (#135 reverted from `In Review` to `In Progress` after a
  verified edit) — board state was re-applied and re-verified.
- **#141 filed** — P5a's R56 was verified in one direction only. An Aheed admin's tampered
  `vendorId`/foreign tier key were both ignored (write landed on Aheed, SriMart byte-for-byte
  unchanged), but the reverse leg `validation.md` asks for — a **SriMart** admin submitting from the
  SriMart host — was skipped, because `scripts/demo-accounts.ts` seeds memberships against the first
  ACTIVE vendor only, so no SriMart admin exists. A test-coverage gap, not a known defect; the fix
  worth making is seeding a per-vendor admin for every active vendor, which several later slices
  will want anyway.
- **P5a — loyalty points: earn, redeem, tiers, expiry & admin config** (#135,
  `specs/2026-08-11-p5a-loyalty-points/`), the first P5 slice and the loyalty half of the phase.
  A shopper earns per-vendor points on orders they actually pay for, spends them at checkout, and
  loses them to inactivity. The discounts engine stays P5b.
  - **One money seam, so the payment path needed no change at all.** `computeTotals` gained a
    discount and the identity `subtotal − discount + delivery = total`; everything downstream —
    the `Order` row, `Payment.amountPence`, the Stripe session amount — derives from it, so
    `lib/payments.ts` and the webhook are untouched and **ADR-005's decisions are unaltered**
    (it gains an additive implementation note only). Free delivery and the vendor's minimum order
    are judged on the subtotal **before** the discount: custom already earned isn't clawed back by
    paying with points.
  - **A double-spend is structurally impossible.** `LoyaltyAccount.balancePoints` is a
    compare-and-set counter guarded by a conditional `updateMany` carrying `vendorId`, `userId`,
    `balancePoints: { gte: n }` and the lapse bound — the same technique P3b used against
    overselling and P4b against double-advancing, aimed at a third race. The append-only
    `LoyaltyLedgerEntry` beside it is the audit trail, exactly as `OrderItem` sits beside
    `Inventory.quantity`; a `SUM()` balance cannot be guarded, which is why both exist.
  - **The debit runs before the order is written**, so an order can never carry a discount whose
    points the shopper turned out not to have. `@@unique([orderId, kind])` makes a second `EARN`
    (duplicate Stripe delivery) or a second `REDEEM` (double submit) a database error rather than a
    check someone has to remember.
  - **Points are credited on payment confirmation**, inside the transaction that sets `CONFIRMED`,
    and **only a `REDEEM` is ever reversed** — `releaseOrder` acts on `PENDING_PAYMENT` orders,
    strictly before an earn exists, so no current path can cancel an earned order. Earn reversal
    arrives with refunds (ADR-005 territory).
  - **Expiry is derived at read time, adding no infrastructure.** `wrangler.toml` still declares no
    cron triggers; a lapsed balance reads as zero, is refused by the redemption guard, and is reset
    rather than incremented by the next earn.
  - Earning excludes both delivery and the discounted portion, so redeemed points cannot re-earn
    points. Tier multipliers are basis points and are **snapshotted onto the earn**, keeping a
    historical earn explainable after the tier table changes. Redemption is clamped so
    `discountPence` is always exactly `pointsSpent × pencePerPoint` and the payable total never
    falls below `MIN_PAYABLE_PENCE` (30p) — below Stripe's GBP floor an order would exist that
    could never be paid for.
  - Surfaces: `/account/loyalty` (balance, cash value, lifetime, tier, ledger) and an ADMIN-only
    `/staff/loyalty` on P4b's `/staff` segment. `STAFF` is deliberately excluded there — advancing
    an order is a packing-floor action, changing the earn rate is an owner decision.
  - One additive migration: three tables, one enum, `Order.discountPence` and six `VendorConfig`
    columns, all defaulted. Seed turns loyalty **on** for Aheed with two tiers and deliberately
    **off** for SriMart, which is what proves it is per-vendor data.
  - Also corrected here: the order confirmation email gains a discount line — without it the three
    money lines stop reconciling the moment an order carries a discount. No new email is sent.
  - Deliberately excluded: the discounts engine (P5b), tier create/delete from the admin UI, guest
    loyalty, and cross-vendor balances.

- **P4b — staff order status transitions & delivery emails** (#125,
  `specs/2026-08-11-p4b-order-status-transitions/`), the write half of P4 and the slice that closes
  the phase. `OUT_FOR_DELIVERY` and `DELIVERED` have been in the `OrderStatus` enum since P3b's
  initial migration with **nothing in the codebase able to reach them** — an order landed on
  `CONFIRMED` when Stripe's webhook fired and stayed there forever. P4a made status visible; this
  makes it move, under a real person's hand, with that person on the record.
  - **A vendor-role-gated staff queue at `/staff/orders`** — `requireVendorRole("STAFF","ADMIN")`,
    the **first real consumer of ADR-004 slice 3a's `VendorMembership`**, which until now had no
    caller exercising it. A new `/staff` segment parallel to `/dev`, so P6's admin panel has a
    namespace to grow into rather than needing a URL migration.
  - **A double-advance is structurally impossible, not merely unlikely.** Legality is evaluated
    against the *persisted* status and the write is a conditional `updateMany` whose `where` repeats
    that status — the same compare-and-set P3b used to make overselling impossible, aimed at a
    different race. A stale tab or a double click matches zero rows and writes nothing. `vendorId`
    sits in the `where` too, so another vendor's order number is indistinguishable from one that
    does not exist.
  - **`OrderStatusEvent.createdByUserId`**, nullable, `ON DELETE SET NULL` — the slice's one
    additive migration. This **corrected issue #125's own "no schema change" line**, which was an
    Orient-time observation rather than a decision and could not survive contact with "the acting
    user recorded". P4's roadmap line promises an audit trail, and attribution not captured now is
    unbackfillable. Nullable means P3-era rows need no backfill and system transitions keep leaving
    it null; `SetNull` because removing a departed staff member's account must not delete the audit
    trail of the orders they handled.
  - **The transition rules are pure** (`canTransition`/`nextStatus` over a `LEGAL_TRANSITIONS` map
    in `lib/order-status.ts`, unit-tested across the full 5×5 matrix by asserting the exact legal
    set, so a future added status cannot widen the ladder silently). `PENDING_PAYMENT` is absent as
    a *source*: only Stripe's webhook moves an unpaid order. Staff cannot cancel — that is
    refund-adjacent (ADR-005) and a decision of its own.
  - **The server action re-runs its own RBAC check.** A server action is a public endpoint exposed
    at a stable action id; a gate on the page is a gate on the page and nothing more.
  - **Emails on the two staff transitions only**, sent after the transaction commits and never
    throwing — a delivery that physically happened must not be undone because a provider was
    unreachable. No `CONFIRMED` branch exists, so P3c's confirmation email stays the only one for
    that event.
  - **`note` stays system-written.** P4b ships no input through which staff can type into that
    column, so P4a's structurally-unrenderable-note guard is honoured by not opening the door. A
    staff-authored note needs a customer-visible/internal distinction and belongs with P6.
  - The queue is **keyset-paginated** like P4a rather than a fixed `take`: a worklist that silently
    stops at row *N* hides the order nobody packs. It shows only actionable statuses, deliberately
    inverting P4a's unfiltered customer list — a shopper is hunting one order, a packer is working a
    queue.
  - Deliberately excluded, tracked: a staff order **detail** view, filters, search and bulk actions
    (**#129**, P6's panel supersedes this queue wholesale).

### Fixed
- **`CLAUDE.md` documented `lib/config`'s env precedence backwards, and always had.** It claimed
  `process.env` wins over the Cloudflare request context, "so local `.env` wins in dev and a stray
  `.dev.vars` can't shadow it". `readEnv()` does the opposite — it tries `getCloudflareContext()`
  first and falls through to `process.env` only when there is no Worker request context — and has
  since the file was written (`e41e8ec`). So under `npm run preview` **`.dev.vars` wins**, which is
  exactly how a fixture script (reading `.env`) and the app under preview can silently use different
  Neon projects while every result still looks plausible (**#119**). Found at P4a's Validate, where
  the two files did point at different projects. Corrected to describe real behaviour; the code is
  unchanged, since flipping the precedence would be a behaviour change needing its own proposal.

### Changed
- **P4a closeout docs**: roadmap change-log row for the slice (`specs/roadmap.md` 1.11.0), and a
  `specs/sdd-workflow.md` (2.3.0) Spec-stage rule earned twice in one slice — **don't `grep` for the
  absence of a word in prose or commented code**, because the artifact names what it deliberately
  excludes, so the check matches its own explanation and "passing" means deleting the rationale
  (P4a's R5 at Build, R27 at Validate). P4a's `validation.md` R27 row corrected in place.
- **P4b closeout docs, and P4 closed.** `specs/roadmap.md` (1.13.0) gains P4b's promotion row and a
  **P4 closure** row: order history, the three-step ladder with an attributed audit trail, staff
  updates and delivery emails are all in production, and the one gap carried out of the phase is
  infra not code — Resend still has no verified sending domain (**#104**), so P4b's emails are
  correct in every structurally checkable respect and still cannot be confirmed to reach a real
  inbox anywhere. The promotion row deliberately **supersedes `build-notes.md`'s "nothing in this
  slice has touched a real database"**: that was true when written and is what aimed validation at
  the right places, and three of the four "known-shaky" areas it named came back clean under live
  checking — the compare-and-set held under a genuine concurrent `Promise.all` double-submit, the
  keyset crossed a real 20/6 page boundary, and the migration applied with no drift and no row
  touched.
- **`specs/sdd-workflow.md` (2.4.0) — a third grep-shaped check retired, and a CI trap written
  down.** P4b's `validation.md` R23 row required `grep` to show **no** `skip:` in the staff list
  method; `skip: 1` is Prisma's standard keyset idiom for excluding the cursor row, already shipped
  in P4a's `listForUser` and P2b's `products.ts` and endorsed by `specs/architecture.md`. The check
  would have failed a correct implementation and passed one that dropped the cursor entirely — the
  same class as the rule P4a added. Row corrected in place. Separately, the Clear checklist now
  requires `npm run kms:build-index` to have been run and committed: **every slice adds a
  front-mattered `plan.md`, so every slice makes `ARTIFACT_INDEX.md` stale**, CI's `gates` job fails
  on exactly that, and nothing local catches it — not `sdd:preclear`, not Validate's pre-flight. P4a
  remembered by hand, P4b didn't and burned a red CI run. **#132** tracks making it mechanical.

### Added
- **P4a — order history & status timeline** (#122, `specs/2026-08-11-p4a-order-history/`), the first
  P4 slice and the read half of the phase. A signed-in shopper gets `/account/orders` — their own
  orders for **this vendor**, newest first, ten per page — and `/account/orders/{orderNumber}`,
  showing the purchased lines, the snapshotted delivery address, and a **status timeline**. P4a
  builds less than P4's roadmap line implies because P3 left more behind than the line recorded:
  `OrderStatusEvent` rows were already being written in three places and `Order` already carried
  `@@index([vendorId, createdAt])`, so this slice is **read-only — no schema change, no migration**.
  - **`getForUser()` is a second, stricter read next to `getByOrderNumber()`, which is untouched.**
    The existing method implements P3b's capability-URL rule — a guest order has no owner, so the
    unguessable order number *is* the credential. That is right for `/checkout/{n}` and wrong for
    `/account/orders/{n}`: a page claiming to be *your* history must not render someone else's order
    because a valid number was pasted into the address bar. `userId` is part of the `WHERE`, not a
    post-hoc check, so a guest order and another member's order both simply fail to match.
  - **The timeline is built from `status` and can never render `OrderStatusEvent.note`.** Today's
    notes are system-written and harmless, but P4b hands staff a control that writes that column,
    and an internal note on a customer's own order page is a live incident rather than a cosmetic
    bug. `buildTimeline`'s types carry no note field, the repository does not select it, and a unit
    test asserts a smuggled note cannot reach the output — the leak is unrepresentable, not merely
    unlikely.
  - **The list is deliberately unfiltered by status.** An abandoned `PENDING_PAYMENT` order and a
    `CANCELLED` one both appear. Hiding them would look tidier while concealing the exact order
    someone is most likely hunting for after a failed payment.
  - Pure, DB-free logic in `lib/order-status.ts` (12 unit tests), matching the split already used by
    `lib/cart-rules.ts` and `lib/shopping-list.ts`; `en-GB` dates pinned explicitly, because a
    Workers isolate has no user locale and an unpinned format renders the US month order.
  - `components/orders/` extracts the items/totals and address cards out of the P3b confirmation
    page so both order pages share one implementation instead of two copies of the money breakdown.
  - Deliberately excluded, each tracked: guest order lookup (**#123**), reorder-from-a-past-order
    (**#124**, inherited from P3d), and all staff transitions and delivery emails (**#125**, P4b).
  - Two **spec** rows were corrected during the build rather than worked around, recorded inline in
    `requirements.md`: R9 demanded "exactly one Prisma query", which a nested relation `select` can
    never satisfy (Prisma issues a second batched query unless `relationJoins` is enabled) and now
    states the property that matters — no N+1; and R5 verified "no note field" with a grep that
    matched the module's own explanatory comment, which would have meant deleting the explanation to
    please the check.

### Changed
- **`specs/sdd-workflow.md` 2.2.1** — corrects the delivery-board blockquote, which claimed
  `Backlog` and `In Review` "do not exist yet" and told the reader to substitute `Todo`. Both are
  false: Project #2 has all four Status options and `CLAUDE.md` already records the rename as done,
  so a reader following the workflow doc would have filed status wrongly. Rides P4a's branch per the
  carry-forward rule.
- **Post-promotion documentation pass for P3 in production** (`specs/roadmap.md`,
  `docs/env-setup.md` 1.7.0) — rescued from PR #110, which branched before P3d and had gone stale
  and conflicting; the content below is the part of it that had not landed any other way.
  - **The roadmap now records the promotion itself** (PR #108) in the existing promotion-entry
    style: `deploy-production` green, production `/api/health` reporting commit `034a380` with
    `db.ok: true`, and `/api/webhooks/stripe` live (an unsigned POST is rejected 400, so signature
    verification is active). It also records that the two P3 migrations were **already applied** to
    the production database — CI reported "no pending migrations" — because no `main` push occurred
    between PR #81 and #108, so they reached production out-of-band. No drift resulted (CI
    confirming zero pending *is* the proof repo and DB agree), but it bypassed `CLAUDE.md`'s
    migrations-run-in-CI rule, which is worth having on the record rather than discovering twice.
  - **Corrects two claims in `env-setup.md` that live verification made false**: it said production
    would use a live Stripe key and that test mode was for "everything except production".
    Production deliberately runs **test-mode** keys, because it shipped before the storefront opened
    to customers; installing a live key is a separate decision (#113), not a consequence of
    promoting code.
  - **Puts the per-endpoint webhook trap where operators will hit it** — each Stripe endpoint has
    its own `whsec_…`, so staging's cannot verify production's deliveries, and the failure is
    *silent*: the handler rejects every delivery, so orders never leave `PENDING_PAYMENT` and their
    stock is never released. Also records the Cloudflare gotcha that forces deploy-then-secrets
    ordering: a Worker secret cannot be edited while an undeployed version is pending.

### Fixed
- **`sdd:audit` was passing a slice it should have failed** (`scripts/sdd-check.ts`). The check that
  exists specifically to catch "shipped without a roadmap entry" reported P3d as documented while
  the roadmap said only that P3d was *still to come*. It matched a bare token (`p3d`) against
  change-log rows, guarded by `row.date >= sliceDate` on the reasoning that a row predating a slice
  can't document it. That guard does not hold: the P3a/P3b/P3c backfill row is dated `2026-08-10`
  and names "P3d", and the P3d slice dir is **also** `2026-08-10`, so the row satisfied its own
  guard. Spec and ship land the same day routinely here, so same-day collisions are the normal case,
  not an edge. A row now counts only when it cites the slice's **spec path** (`specs/<slice>/`) —
  precise, unfakeable by prose, and already the convention every real closure row follows. Verified
  by watching it fail on the genuine P3d gap, then pass once the real row landed. This is the third
  time this specific gap has bitten: P3a/P3b/P3c shipped undocumented, the audit was written to stop
  it, and the audit then let P3d through too.
- **`configure-env.mjs` now knows about the Stripe secrets.** P3c added `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` as Worker secrets but never taught the sync tool about them, so the
  script silently reported them as "unrecognized" and skipped them — which is why production ran
  without Stripe credentials until they were set by hand. Added as a new **`OPTIONAL_WORKER_SECRETS`**
  list rather than under `WORKER_SECRETS`, mirroring the app's own contract: `getPaymentService()`
  falls back to the stub when `STRIPE_SECRET_KEY` is unset, so an environment without Stripe is a
  supported state, not a misconfiguration. Making them required would block configuring a fresh
  environment that has no Stripe yet — verified both ways (present → pushed; absent → skipped,
  exit 0). `STRIPE_PUBLISHABLE_KEY` is deliberately still unrecognized: hosted Checkout runs
  nothing in the browser, so the app never reads it.
  - Records the trap that caused the mismatch: **`STRIPE_WEBHOOK_SECRET` is per-endpoint, not
    per-account.** Staging's value cannot verify deliveries to production's endpoint, so it must
    never be copied between environments — each `secrets/<env>.vars` carries the secret belonging
    to that environment's own Stripe endpoint.
- **Backfilled the missing P3a/P3b/P3c roadmap change-log entries** (`specs/roadmap.md` 1.9.0). All
  three slices shipped without one — the roadmap still ended at ADR-004 slice 3c (2026-08-09) while
  cart, checkout and Stripe payments were live on staging. Records what each slice delivered, the
  live-verification outcome for P3c, and that **P3 remains open pending P3d ("Shop your list")**.
  This is the gap that motivated the post-Ship documentation audit in `specs/sdd-workflow.md` 2.0.0:
  every SDD gate fires before or at merge, so the roadmap update — which happens after the PR lands
  — had nothing enforcing it. The KMS index, by contrast, was never at risk: `gates.yml` already
  rebuilds and diffs it (normalizing timestamp and commit) on every PR.

### Added
- **P3d — "Shop your list"** (#114, `specs/2026-08-10-p3d-shop-your-list/`): the second way to fill
  a cart. Paste a list, see what each line matched, then add the confirmed lines in one action. The
  last P3 slice.
  - **Matching is token-AND on product `name`**, in a new `ProductRepository.matchListTerms()` that
    issues **one** query for the whole list (candidate rows, capped at 200) and leaves every
    per-line decision to pure code in `lib/shopping-list.ts`. Deliberately not
    `ProductRepository.search()`: that is a single `contains` OR'd across name and description, so
    `"2x chicken breast"` matches nothing — exactly the input this feature invites. Matching
    `description` was rejected too, since a term hitting prose yields a confident-looking wrong
    product.
  - **A leading bare integer is a quantity only when not glued to a unit** — `2 apples` is two
    apples, `5kg basmati rice` is one bag of *Basmati Rice 5kg*. Four seeded products carry a size
    in their name, so this is ordinary input, not an edge case. Explicit `2x` / `x2` forms always
    win.
  - **Nothing enters the cart unreviewed.** Every line renders as matched, ambiguous (with a
    chooser), unmatched, or unavailable; only an explicit action writes. Ambiguity is real here —
    `milk` matches both *Whole Milk* and *Coconut Milk*.
  - **The matching pass writes nothing at all** — no `Cart`, no `CartItem`, no guest cookie —
    preserving P3a's rule that browsing creates no state. The guest token is issued only by
    `add-list-to-cart`.
  - New `CartRepository.addItems()` resolves the cart once and writes every line in a single
    transaction, reusing `effectiveStock()`/`clampQuantity()` rather than re-deriving them.
    Duplicate lines are summed first (`sumLinesByProduct`), since two upserts of one row inside a
    transaction would fight. Product ids from the stateless review form are **untrusted**: stock is
    resolved through the existing vendor-scoped `stockMap`, so an id from another vendor has no row,
    resolves to 0, and is skipped.
  - **Typos are explicitly out of scope** (`bannanas` reports unmatched). Handling them means
    `pg_trgm`, whose `similarity()` needs `$queryRaw` — forbidden in application code — and P2
    deliberately deferred trigram search. The mandatory review step is what keeps that honest: an
    unmatched line is visible, not silently dropped.
  - No schema change, no migration, no saved lists.
- **Two machine checks behind the SDD loop's honor-system stages** (`scripts/sdd-check.ts`,
  `specs/sdd-workflow.md` 2.1.0). Every existing gate fires before or at merge — `pre-commit`
  (Gate 2), `pre-push`/`gates.yml` (Gate 4), CI (Gate 3) — so nothing had teeth after Ship. That is
  how P3a/P3b/P3c all shipped with no roadmap entry.
  - `npm run sdd:preclear` (end of `/build-notes`) — derives the slice from the branch diff, then
    requires all four spec files, the build-notes template's four sections, a `CHANGELOG.md` diff
    against the base, and a clean working tree. The Clear is irreversible, so "everything is
    persisted" stops being a claim and becomes an exit code.
  - `npm run sdd:audit` (at `/orient`) — reports slices that shipped without a roadmap change-log
    entry or never reached `ARTIFACT_INDEX.md`. **Only audits slices after a baseline constant**, so
    it never retroactively polices work that predates the loop. A roadmap row only counts if it is
    dated on/after the slice — without that, the backfill row naming P3d would have satisfied the
    check for an undocumented P3d.
  - Both copy `hooks/pre-push`'s posture (origin/staging → origin/main → don't block offline) and
    reuse `readFrontMatter`/`ROOT` from `kms/schema/repo`. Verified against real history: with the
    baseline set before P3a, the audit reports the exact three gaps that existed pre-backfill.
- **`specs/templates/feature-spec/build-notes.md`** — build notes stop being free-form. Its four
  headings are exactly what `sdd:preclear` greps for, making the template the check's contract
  rather than decoration. `plan.md`/`requirements.md`/`validation.md` were already templated; the
  one artifact the Clear actually bets on was not.
- **Delivery-board steps wired into the loop.** Propose adds the issue to GitHub Project #2 with a
  Phase; Build moves it to In Progress; Ship moves it to **In Review** on staging merge; it closes
  to **Done** only on promotion to `main` — because `Done` means *in production* and `Closes #NN`
  never fires on a merge into `staging`. Ten issues (#93–#106) filed after the board was provisioned
  had never been added to it; `scripts/provision-project.sh` was re-run to adopt them. **Still
  needed, UI-only:** the Status field keeps GitHub's default `Todo/In Progress/Done`, so `Backlog`
  and `In Review` don't exist yet.

### Changed
- **P3 closed** (`specs/roadmap.md` 1.10.0). Cart → checkout → payment → list-based cart entry all
  shipped to production (P3a #93, P3b #96, P3c #99, P3d #114). Adds the P3d closure row and the
  phase-closure row, and carries out the two known gaps — both infra, not code: Resend has no
  verified sending domain so no confirmation email reaches a real inbox in any environment (#104),
  and the payment-provider failure path still needs a window against staging's live secrets (#103).
  Neither blocks P4.
- **P3d's R10 corrected after ship** (`specs/2026-08-10-p3d-shop-your-list/requirements.md`). The
  row specified ranking as "all-terms matches first, then shorter name, then alphabetical", but R9
  defines a candidate *as* an all-terms match, so that first tier can never fire. Flagged as a
  deviation at build and confirmed at `/validate` as a **spec defect rather than an implementation
  shortcut** — `rankCandidates()` shipped the two reachable tiers instead of a branch that provably
  cannot execute. The requirement now says what the code does; every behaviour it asserts
  (exact-match-wins, determinism, the 5-candidate cap) was already tested. Corrected in place with
  a dated note rather than rewritten silently.
- **How to validate server actions without a browser** (`specs/sdd-workflow.md` 2.1.0 → 2.2.0,
  Validate stage). Next renders progressive-enhancement fields on every server-action form, so
  posting those fields as `multipart/form-data` invokes the real action — and the response's
  `Set-Cookie` is how you prove a *negative*, which is how P3d's "matching writes nothing" was
  actually verified rather than inferred. Records the three traps that each cost a dead end:
  `fetch`/undici **silently drops a caller-set `Host` header** (fatal under multi-tenancy — every
  request resolves to `/coming-soon` and reads as a broken app; use `node:http` with
  `setHost: false`), `$ACTION_REF_1` renders with **no `value` attribute** (a parser requiring one
  drops it and the POST fails as a bare `500` with an empty body), and a `<select>` is a form field
  that must be serialized in document order alongside `<input>`s. Also adds: confirm which database
  the Worker is on before trusting a live result, since `preview` reads `.dev.vars` while seeds and
  inspection scripts read `.env` (#119).
- **SDD workflow restructured from a seven-stage sequence into a delivery loop with two context
  Clears** (`specs/sdd-workflow.md` 1.0.0 → 2.0.0). The order is now **Orient → Propose → Spec →
  Build → Document (build notes) → CLEAR → Validate ⇄ Fix → Ship → Document (final) → CLEAR →
  Orient**, with the model switching to Sonnet 5 for the validation half and back to Opus 5 for the
  final documentation pass.
  - **Why the Clear before Validate:** a context that just built something is the worst judge of
    whether it matches the spec — it remembers the intent and reads that intent into the code. The
    reset forces Gate 3 to run against `requirements.md` and the artifact on disk, which is the only
    version of the spec a future maintainer ever gets. This already caught real defects under the
    old single-context flow (a consolidated `features/cart/actions.ts` that deviated from the
    spec's one-file-per-action shape; webhook functions resolving `getPrisma()` internally, so they
    couldn't be proven against real Postgres) — the reset makes that systematic rather than lucky.
  - **Document split in two.** `/build-notes` (new) is a **write-to-disk** stage before the Clear:
    build notes, persistent-doc updates, deferred items filed as issues — and **Gate 4's CHANGELOG
    entry**, which has to be on the branch before it merges, i.e. before Ship, which now precedes
    the final documentation pass. `/document` is now purely the post-ship durable record (KMS index,
    roadmap, reconciling docs with what validation actually found) and supersedes the build notes
    where they disagree.
  - **`/fix` (new)** formalises the Validate ⇄ Fix cycle: fix the root cause rather than the check,
    re-run `/validate` from the top rather than just the failed row, and stop when a "fix" is really
    a redesign — that's a Spec-level change, not something to improvise in a validation mindset.
  - Existing commands realigned: `/build` now hands off to `/build-notes` instead of `/validate`,
    `/validate` treats build notes as a claim about the artifact rather than evidence, `/orient`
    doubles as the post-Clear re-entry point, and `/spec` records that `requirements.md` is the only
    thing the fresh validation context will have.
  - **Two rules the assistant cannot enforce on itself** and must therefore ask for, now stated in
    `CLAUDE.md`: `/clear` is user-invoked, and so is every model switch.

### Added
- **Stripe payments, webhooks & confirmation email (P3c, #99)** — money actually moves
  (`specs/2026-08-10-p3c-stripe-payments/`). Replaces P3b's stub with a real hosted **Stripe
  Checkout** adapter, a signature-verified idempotent webhook at `/api/webhooks/stripe`, and an
  order confirmation email. **Closes the stock-release gap P3b explicitly recorded**: an order that
  fails or expires now returns its items to stock instead of holding them forever.
  - **Fixes a latent defect in P3b**: `createPayment()` was called *inside* `placeOrder`'s Prisma
    transaction. Harmless with a stub that does no I/O — which is why it passed every check — but a
    real HTTP call there would hold a Postgres transaction open on a serverless connection against
    Prisma's 5s timeout, so a slow Stripe response would roll back a good order. The session is now
    created **after commit**, and if it fails a **compensating transaction** cancels the order and
    releases its stock, so a shopper is never left with an unpayable order holding inventory.
  - **Raw `fetch`, no `stripe` SDK** — the same Worker-bundle reasoning that chose `aws4fetch` over
    the AWS SDK and plain fetch over Resend's. Signatures are verified with **WebCrypto**
    (HMAC-SHA256 over `{timestamp}.{rawBody}`, constant-time compared, 5-minute replay tolerance),
    using the **raw** body — re-serialising parsed JSON changes bytes and breaks verification.
  - **Idempotent by the same conditional-update guard as the stock decrement** (`WHERE status =
    'PENDING_PAYMENT'`), not a new event-log table. Stripe retries aggressively and can deliver out
    of order, so a duplicate delivery must change nothing — and must not send a second email or
    release stock twice.
  - **The webhook is vendor-agnostic**: it has no tenant context, so it finds the order by the
    `orderNumber` in session metadata and derives the vendor from the row. **One endpoint per
    environment, not one per vendor host** — the same Worker serves every host, and per-host
    endpoints would produce multiple signing secrets the single `STRIPE_WEBHOOK_SECRET` can't hold.
  - **`checkout.session.completed` alone isn't enough** — it can fire `payment_status: "unpaid"` for
    asynchronous methods, so confirmation requires `"paid"`.
  - **The confirmation email fires only from the webhook**, after payment confirms — never at order
    creation, where a later failure would leave the shopper holding a "confirmed" email for a
    cancelled order. Email failure never rolls back a confirmed payment.
  - **`/checkout/{orderNumber}` is now status-aware** rather than assuming the redirect means
    success: the browser redirect routinely races the webhook and a closed tab means it never
    happens, so the page renders whatever `order.status` actually is.
  - Two new **optional** Worker secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); with neither
    set the app **falls back to the stub**, so local dev and CI need no Stripe setup. Deliberately no
    `STRIPE_PUBLISHABLE_KEY` — hosted Checkout never runs anything in the browser. Deferred and
    tracked: resume-payment for stuck orders (**#100**), webhook reconciliation sweep (**#101**).
  - **Live-verified against staging** (2026-08-10) with real Stripe test-mode keys: two real
    payments confirmed the webhook, idempotency, and status-aware confirmation page against
    staging's actual database. Uncovered a real infra gap in the process — Resend has no verified
    sending domain yet, so it rejects delivery to any address outside its own test address
    (**#104**, owner action). That failure incidentally proved the email-failure-is-non-fatal
    guarantee live: the order still confirmed and the webhook still returned 200. Remaining gap
    (payment-provider failure path, **#103**) needs a deliberate window against staging's live
    secrets rather than being done inline.
- **Checkout + order core (P3b, #96)** — a cart can now become a real order
  (`specs/2026-08-10-p3b-checkout-order-core/`). Adds vendor-scoped `Address`/`Order`/`OrderItem`/
  `Payment`/`OrderStatusEvent` behind a new `lib/repositories/orders.ts`, a `/checkout` page
  following `docs/ui-ref/CheckoutModal.tsx`, and a `/checkout/{orderNumber}` confirmation served
  from the persisted order so a refresh shows the same thing.
  - **Overselling is structurally impossible.** The whole checkout is one interactive transaction —
    decrement stock → create address/order/items/payment/status-event → clear the cart — and the
    decrement is a **conditional `updateMany`** (`quantity: { gte: qty }`) whose `count === 0` means
    someone else took the last one, rolling everything back. No raw SQL (`CLAUDE.md`), no
    read-then-check gap. Clearing the cart *inside* the transaction also makes a **double submit**
    safe: the second finds an empty cart instead of creating a duplicate order.
  - **Stock decrements at order creation**, so an order opens as **`PENDING_PAYMENT`** — an unpaid
    order must never read as `CONFIRMED` or staff would pick and deliver it. ⚠️ **Gap until P3c:**
    an abandoned checkout holds its stock, because release on payment-failure/expiry is P3c's
    webhook. **P3b must not reach production ahead of P3c.**
  - **Money is recomputed server-side** from the database inside the transaction and never read from
    the form; prices are then snapshotted onto `OrderItem`. The **delivery address is snapshotted
    per order** for the same reason — editing a saved address later must not rewrite where a past
    order went.
  - Five checkout gates, each its own error: unresolved P3a merge, empty cart, unavailable line,
    undeliverable postcode (via the existing `isDeliverable`), and below the vendor's minimum order.
  - **`PaymentService` port created** (`lib/payments.ts`) — named in `tech-stack.md` since the
    architecture baseline, never previously written. P3b ships a **stub** that charges nothing, so
    the risky logic was testable before any Stripe credential existed; P3c swaps in Stripe.
  - **Order numbers** are `{VENDOR}-{YYYYMMDD}-{6 random}` with the prefix derived from the vendor
    slug — deliberately **not sequential**, since a counter lets anyone who places two orders infer
    the shop's volume. Collisions retry against the unique index rather than being assumed away.
  - **ADR-005 — Payments & multi-vendor money flow**: Stripe behind the port, hosted Checkout (it
    handles UK SCA/3DS, a legal requirement), and a single platform account with a Connect-ready
    seam. Records the **merchant-of-record** consequence — with one account the platform is the
    seller for every vendor's sales, which is acceptable only while Aheed is the sole real merchant.
  - Additive migration (two enums + five tables). `VendorProfile` gains `slug`. `architecture.md`
    (v1.8.0) and `tech-stack.md` (v1.1.0) updated.
- **Cart foundation (P3a, #93)** — the storefront's inert "Add to Cart" is now real
  (`specs/2026-08-09-p3a-cart-foundation/`). Vendor-scoped `Cart`/`CartItem` behind a new
  `lib/repositories/cart.ts`, so one shopper has an **independent cart per vendor**. Identity is
  **exactly one of** `userId` or an opaque `guestToken` in a **host-only** `aheed_cart` cookie
  (mirroring slice 3c's isolation), and carts are created **lazily** — no row and no cookie until a
  first add, so crawling this public, indexed storefront writes nothing. UI follows
  `docs/ui-ref/CartDrawer.tsx`: a slide-out drawer whose **contents are server-rendered** (quantity
  and remove are plain `<form>` posts to server actions) with only open/close as a client island,
  plus a `/cart` route as the canonical URL. `AddToCartButton` is the one other island — it exists
  because `ProductCard`'s body is a `<Link>` and the click must not navigate.
  - **Two carts are never silently merged.** Signing in with both a guest and a saved cart prompts
    the shopper — combine (sum, capped at stock) / keep saved / keep new — and nothing is destroyed
    until they choose. No prompt when there's nothing to decide (empty saved cart is simply adopted).
    This is also what makes the shared-device case safe: a second person signing in on a borrowed
    browser is *asked* about the stranger's basket rather than inheriting it.
  - **The cart stores no prices** — unit price is read from `Product` at render and is snapshotted
    into `OrderItem` only at order creation (P3b); a cart that cached prices would serve stale money.
    Stock is advisory here and authoritative at the P3b decrement (a cart is not a reservation).
  - **Delivery rules became vendor data**: `VendorConfig` gains `deliveryFeePence` (default 349),
    `freeDeliveryThresholdPence` (null = never free) and `minimumOrderPence` (default 0), seeded
    differently for Aheed and SriMart. The reference mockup's hardcoded `£30` threshold and
    `#1B5E20` greens are **translated, not copied** — thresholds come from the DB and colours through
    `design-system.md`'s token table, so per-vendor theming can't regress the way #77 did. Applying
    fee/minimum to a payable total stays P3b.
  - Edge cases closed during spec review: a product with **no `Inventory` row** counts as out of
    stock (never unlimited), and a product that goes inactive **while sitting in a cart** renders as
    unavailable and is excluded from the subtotal instead of quietly adding money.
  - Additive migration (two tables + three defaulted/nullable columns). `ProductSummary` gains
    `inStock` so cards can show the out-of-stock state. Deferred: abandoned guest-cart cleanup
    (**#94**, likely P7 with the GDPR retention review).
- **GitHub Project delivery tracking (`scripts/provision-project.sh`).** Adds the idempotent
  provisioning script for the *Aheed Online Store — Delivery* Project (Projects V2), plus the
  `specs/roadmap.md` note establishing the rule: **the Project is a generated view of the roadmap,
  never a second plan** — it carries only the status layer (in progress / in review / blocked), while
  scope and acceptance criteria stay in `specs/`. Provisions 6 area labels, 11 milestones 1:1 with the
  roadmap phases (M0–P2.5 created **and closed**, P3–P8 open), and one epic per unspec'd phase (P3–P8)
  linking to its criteria rather than copying them. Check-then-create throughout: a re-run creates
  nothing. Deliberately omitted as duplication: a `feature` label (the repo already uses
  `enhancement`), `priority:*` labels (Priority is a Project field), and `phase:*` labels (Phase is a
  Project field). **Two GitHub limits, flagged not papered over:** Projects V2 exposes no public API
  for built-in workflows or view creation (the script prints the UI steps), and issues here never
  auto-close on `Closes #NN` because PRs merge to `staging`, not the default branch — so **Done means
  "promoted to production"** and staging-merged work legitimately sits in In Review.
- **Data-driven auth cookie scoping (ADR-004 slice 3c, #74)** — the last multi-tenancy gate before P3
  (`specs/2026-08-09-multitenancy-slice3c-auth-cookie-scoping/`). Better Auth's `baseURL`,
  `trustedOrigins` and cookie domain are now resolved **per request** from the host
  (`lib/auth-origin.ts`: pure `buildAuthOrigin` + async `resolveAuthOrigin`; `getAuth()` is now
  `async`), replacing the single hardcoded `BETTER_AUTH_URL`. Every vendor host gets a **host-only
  session, trusting only its own origin, by default** — no shared subdomain family exists (Aheed and
  SriMart sit on distinct hosts), so isolated-by-default is the correct posture. A new **optional**
  platform env `AUTH_COOKIE_FAMILY_DOMAIN` (unset in every environment today) arms the parent-domain
  family-SSO cookie for a future `{slug}.<family>` subdomain family with no code change; a
  custom-domain vendor never matches it and stays isolated. No schema/migration change. **Onboarding
  caveat:** because `baseURL` is per host, each vendor host must be registered in the Google OAuth
  client's redirect URIs (Aheed + SriMart done). ADR-004 carries a breadcrumb reconciling decision 4's
  assumed subdomain family with the deployed topology; `specs/roadmap.md` change-log back-fills slices
  3a/3b/4 + the #81 promotion. **ADR-004 slice sequence complete — P3 unblocked.** See the `trustedOrigins`
  correction below (#83), caught during this slice's own staging verification.
- **Per-vendor search-box placeholder (ADR-004 slice 4 follow-up).** The header search placeholder was
  hardcoded Aheed grocery copy ("Search halal lamb, basmati, lentils…") shown on every vendor. Adds a
  nullable `VendorConfig.searchPlaceholder` column (additive migration), read via
  `lib/repositories/vendor.ts` with a generic `"Search products…"` fallback; seeded per vendor (Aheed
  keeps its copy, SriMart gets "Search chargers, earbuds, lamps…"). Re-seed each environment to apply.

### Fixed
- **Auth `trustedOrigins` narrowed to same-vendor-only (#83, ADR-004 slice 3c correction).** Live
  staging verification of #74, right after merge, showed the original design — `trustedOrigins`
  populated from every `VendorDomain` host — would let one vendor's origin pass Better Auth's
  origin/CSRF check on **another** vendor's auth endpoints (e.g. SriMart's origin trusted by Aheed's
  `/api/auth/*`), reopening a cross-tenant surface that isolated-by-default exists to close.
  `trustedOrigins` now contains only the current request's own origin (+ the family wildcard when
  `AUTH_COOKIE_FAMILY_DOMAIN` is armed) — confirmed with the human. `lib/auth-origin.ts` no longer
  needs a DB call at all. `requirements.md`/`validation.md`/ADR-004/`architecture.md`/`env-setup.md`
  corrected to match.
- **Roadmap's slice 3c change-log entry corrected (#83 follow-up).** Missed when #83 fixed the other
  standing docs — `specs/roadmap.md` still described `trustedOrigins` as resolved "from the host +
  `VendorDomain`". Now matches the same-vendor-only design.
- **Multi-vendor browse/product polish (ADR-004 slice 4 follow-up, #79).** Three Aheed-hardcoded
  surfaces that looked wrong on a 2nd vendor (SriMart): (1) the **speciality filters**
  (Halal/Fresh/Organic) are now **data-driven** — `ProductRepository.availableSpecialities()` shows
  each only if the vendor has ≥1 active product with that attribute (a tech vendor shows none); (2)
  the shared product-image placeholder no longer reads "Aheed placeholder" — `placeholder-product.svg`
  is now brand-neutral ("No image", grey), re-uploaded to existing products by a new seed
  `refreshProductImages` step; (3) `app/manifest.ts` is **vendor-aware** (name/short_name/theme_color
  from the resolved vendor, neutral fallback). Re-seed to refresh the placeholder image.
- **Per-vendor theming now recolours the storefront (ADR-004 slice 4 follow-up).** The slice-4
  injection set only the eight `--color-brand-*` primitives on the storefront wrapper, but Tailwind v4
  emits the semantic tokens at `:root` as `var(--color-brand-*)` and the browser resolves that inner
  `var()` **at `:root`** — freezing e.g. `--color-primary` to the default palette, so a 2nd vendor's
  colours never applied (caught on staging: SriMart seeded blue but still rendered green). The wrapper
  now also re-declares the **semantic** tokens (same primitive→semantic mapping as `tokens.css`) and
  derives the hover shades per vendor via `color-mix()`. Data/seed were correct; only the injected
  layer changed (`app/(storefront)/layout.tsx`). No schema/seed change.

### Added
- **Multi-tenancy — branding-as-CSS-vars + config split (ADR-004 slice 4)**
  (`specs/2026-08-08-multitenancy-slice4-branding-config/`, #73). Fills the empty
  `VendorBranding`/`VendorConfig`/`VendorDeliveryArea` satellites and wires the read paths, so a
  vendor's **look and locality are data-driven**: the eight `--color-brand-*` primitives are injected
  as CSS custom properties per request (semantic tokens/components unchanged — the `var()` seam
  cascades), and header/hero copy, locality, delivery area, logo, page metadata and email sender name
  come from the DB. New `lib/repositories/vendor.ts` read path (per-request `cache()`, keeps the
  no-direct-Prisma guard green); `lib/delivery.ts`'s `isDeliverable(postcode, prefixes)` is now pure +
  vendor-scoped; header logo renders from `logoStorageKey` via the CDN or a **text wordmark** fallback.
  Seeds **SriMart** with a visibly distinct (blue/tech) palette, Reading/`RG` locality and its own
  tagline — proving two hosts render as different vendors from data alone. No schema migration (slice-1
  tables) and no new env vars. Deferred (tracked): the per-page `metadata.title` long tail + async
  `manifest.ts`, per-vendor email From (Resend domain verification), a named theme catalogue (#75),
  and dedicated hero-copy columns; auth cookie scoping / family SSO stays slice 3c (#74).
- **Multi-tenancy — host→tenant resolution + 2nd vendor (SriMart)**
  (`specs/2026-08-08-multitenancy-slice3b-host-resolver/`, #70; ADR-004 slice 3b). The app now serves
  the right vendor's data based on the **request host**: a `VendorDomain(host)` table maps hosts to
  vendors, and `lib/tenant.ts`'s resolver looks it up (falling back to the sole vendor while only one
  exists; unmatched hosts with 2+ vendors → a `/coming-soon` page linking to the default store).
  `getCurrentVendorId()` keeps its non-null contract, so repositories/`requireVendorRole` are
  unchanged. **No Next middleware** (edge runtime is forbidden) — the storefront layout gates the
  tenant. Adds **SriMart** as a real 2nd vendor with a distinct dummy catalogue, seeded (with its
  `VendorDomain`) only when both `SEED_AHEED_HOST`/`SEED_SRIMART_HOST` are set. `wrangler.toml`
  declares the `srimart.nocaped.com` / `srimart-staging.nocaped.com` custom domains. Additive
  migration (`VendorDomain` table).
- **Multi-tenancy — per-vendor authorization (`VendorMembership`)**
  (`specs/2026-08-08-multitenancy-slice3a-vendor-membership/`, #68; ADR-004 slice 3a). Authorization
  is now two-tier: `User.role` is the **platform** role (platform `ADMIN` transcends vendors; `/dev`
  still gates on it), and a new **`VendorMembership(userId, vendorId, role)`** carries **per-vendor**
  staff/admin (`VendorRole` = STAFF|ADMIN). A new `requireVendorRole()` gate allows platform admins
  or matching members of the current vendor. The demo-accounts tool now provisions memberships
  (`demo-admin` → Aheed ADMIN, `demo-staff` → Aheed STAFF; `demo-staff`'s platform role corrected to
  CUSTOMER). Additive migration (new table, no backfill). No infra; testable at one vendor. Host
  resolution (3b) and auth cookie scoping (3c) follow.
- **Multi-tenancy — repository-layer `vendorId` enforcement**
  (`specs/2026-08-08-multitenancy-slice2-vendor-enforcement/`, closes #66; ADR-004 slice 2). Adds a
  `lib/tenant.ts` `getCurrentVendorId()` tenant seam (interim: the single ACTIVE vendor; slice 3
  swaps in host→tenant resolution) and injects `where: { vendorId }` across `lib/repositories/*`
  (products/categories/reviews), resolved once per request-scoped repository instance — method
  signatures unchanged, so pages/features are untouched. An ESLint guard now makes importing
  `@/lib/db` (`getPrisma`) or `@prisma/client` an error in `app/`/`features/`/`components/` (the
  `/api/health` infra probe is allowlisted), keeping domain queries inside the repository layer.
  Runtime output is unchanged at one vendor. Also records the deferred slice-0/1 roadmap closure (#65).
- **Multi-tenancy foundation — Vendor aggregate + `vendorId` migration**
  (`specs/2026-08-08-multitenancy-slice1-vendor-schema/`, closes #62; ADR-004 slice 1). Introduces a
  `Vendor` tenancy root plus `VendorBranding`/`VendorConfig`/`VendorDeliveryArea` satellite tables
  (empty until slice 4), and a required `vendorId` FK on `Category`/`Product`/`Inventory`/`Review`.
  Global slug uniques become per-vendor composites (`@@unique([vendorId, slug])`,
  `@@unique([vendorId, userId, productId])`); read indexes lead with `vendorId`. A hand-authored
  migration backfills all existing rows to a single "Aheed Food Centre" vendor (fixed UUID, identical
  across environments). `seed.ts` and the review upsert supply `vendorId`. **Runtime behavior is
  unchanged** — read-side `vendorId` filtering / repository enforcement is slice 2. `User` and auth
  tables stay global (identity is platform-wide).

### Changed
- **KMS internal docs site is now live** at `https://docs.internal.aheedfoodcentre.nocaped.com`,
  gated by a Cloudflare Access self-hosted application (One-time PIN, email allow-list) — the site
  has no auth of its own; Access is the auth. Uncommented the custom-domain route in
  `kms/site-internal/wrangler.toml` (the Access app was created first, so the hostname was gated
  before it ever resolved). `workers_dev` stays `false`. Linking it from the `ADMIN`-gated `/dev`
  page (`KMS_INTERNAL_URL`) is deferred to the dev-role view work (#60).
- **Separated the staging and production Neon databases** (`specs/2026-08-08-neon-db-separation/`,
  closes #56; ADR-004 slice 0). Staging and production no longer share one Neon project — each has
  its own, so a staging test can never read or mutate live production rows (environment isolation vs
  tenant isolation). Production stays on the original project untouched; staging moves to a fresh
  project (migrated by CI, seeded + demo accounts restored via `npm run demo:accounts -- add`).
  `docs/env-setup.md` documents the one-project-per-environment topology and fresh-DB bootstrap. This
  is the prerequisite before the `vendorId` multi-tenancy migration (slice 1).

### Added
- **Demo-accounts tool** (`specs/2026-08-08-demo-accounts-tool/`, closes #57). A standalone
  `scripts/demo-accounts.ts` (`npm run demo:accounts -- add|remove`) that adds/removes the demo login
  accounts (`demo-admin`/`demo-staff`/`demo-customer`, one per RBAC role) on demand against any
  environment via its `DIRECT_URL` — deliberately separate from `prisma/seed.ts` so demo accounts
  survive DB resets and stay in prod + staging until all phases complete.
  - Created **through Better Auth** (hashed, real sign-in) via a minimal **email-free** auth instance,
    with `role` set via a post-signup Prisma update (`role` is `input:false`) and `emailVerified`
    forced true — **no** verification email is ever sent. `add` is idempotent; `remove` cascades.
  - Password comes from `DEMO_ACCOUNT_PASSWORD` (never committed); `docs/env-setup.md` documents usage.
  - Groundwork for ADR-004 slice 0 (#56): restores demo accounts on the fresh staging Neon project.
- **Dev view — admin diagnostics page** (`specs/2026-08-07-dev-view/`, closes #41). A minimal
  ADMIN-gated `/dev` page — the safe core of the mockup's "Developer Control Toolbar", without the
  parts that would either expose secrets or switch to views that don't exist yet.
  - `app/(storefront)/dev/page.tsx` — gated with `requireRole("ADMIN")` (401 → `/login`; 403 →
    "administrators only", not the diagnostics). Real RBAC, not a client toggle.
  - `lib/dev-diagnostics.ts` — `getDevDiagnostics()` returns **non-secret** values only: the
    deployed commit and **configured-or-not booleans** per integration (Google/storage/email/CDN/
    `BETTER_AUTH_URL`), never a key value. Unit-tested, including an assertion that a sentinel
    secret never appears in the serialized output.
  - The page shows environment (derived from host), commit, integration ✓/✗ rows, the admin's own
    session, and a link to the KMS internal docs — or a "pending setup" note until `KMS_INTERNAL_URL`
    is set (the KMS internal site still needs DNS + a Cloudflare Access gate, a human task).
  - **Deliberately excluded**: any secret/API-key/webhook value, and view/role switching (deferred
    to P6, when the Staff/Admin panels it would switch to actually exist).

### Changed
- **Browse-page layout flipped (from live review).** Departments and filters swapped places:
  departments are now a **horizontal, icon-led strip across the top**, scrolled by ‹ › arrow
  buttons with the scrollbar hidden (`.no-scrollbar`) — a small `DepartmentScroller` client
  component (the arrows drive `scrollBy`; it degrades to native touch/trackpad scroll without JS).
  Search + filters moved into a **vertical left sidebar** (`ProductFilterForm` restyled to a stacked
  panel). Applies to the homepage, category, and search pages; the old vertical `CategorySidebar`
  is removed.
- **Storefront polish (from live review).** Delivery check broadened from Milton Keynes MK1–MK19 to
  **any MK postcode district** (MK1–MK99, e.g. MK24 — previously wrongly rejected); `lib/delivery.ts`
  regex + test + copy updated, and the precise per-vendor footprint is flagged as future DB config
  (ADR-004 / #49). The header **logo is cropped (whitespace trimmed) and enlarged** (`docs/logo.png`
  re-exported to `public/images/brand/logo.png`, 298×160, displayed `h-11` mobile / `h-16` desktop).
  **Mobile UI reworked to best practices**: the search bar (previously hidden below `sm`) now gets a
  dedicated full-width row on mobile; the header compacts (icon-only account/cart) instead of
  overflowing; the homepage departments became a **horizontal, icon-led, scrollable row**
  (Uber-Eats style) instead of a grid; and the category sidebar scrolls horizontally on mobile
  rather than burying products under a tall vertical list.
- **`/api/health` now reports the deployed commit** (`commit: "<short-sha>"`, `null` locally),
  giving a reliable way to trace a live environment back to its GitHub commit. Originally attempted
  via `wrangler deploy --tag/--message` (self-labeling the Cloudflare dashboard's Version History)
  — reverted after the first real `deploy-staging` run failed with `Unknown argument: request`.
  Root cause: an upstream Cloudflare limitation, not a quoting bug — `--tag`/`--message` are
  documented on `wrangler deploy` but broken for Static Assets deployments (which this Worker is,
  via OpenNext's `ASSETS` binding); see
  [workers-sdk#9611](https://github.com/cloudflare/workers-sdk/issues/9611) and
  [#10933](https://github.com/cloudflare/workers-sdk/issues/10933). `--dry-run` doesn't hit the
  broken path, so it looked fine locally before the real deploy caught it. Replaced with
  `--var GIT_COMMIT_SHA:$(git rev-parse --short HEAD)` (a stable, well-supported flag) read back via
  `lib/config.ts`'s newly-exported `readEnv()`.

### Fixed
- **KMS — internal docs site build broken by `CLAUDE.md`'s HTML comments.** PR #26 gave
  `CLAUDE.md` front-matter for the first time, which made `kms/scripts/assemble.ts` start
  including it in `deploy-docs-internal`'s build — but its `next dev`-regenerated
  `<!-- BEGIN/END:nextjs-agent-rules -->` markers are valid Markdown, not valid MDX (Nextra's
  compiler parses `<` as a JSX tag open and chokes on the following `!`). Can't fix at the source
  (that exact HTML-comment block is rewritten verbatim by `next dev`, see `CLAUDE.md` itself), so
  `assemble.ts` now rewrites `<!-- ... -->` to `{/* ... */}` for every doc at assembly time.
  Verified: `npm run build` in `kms/site-internal` now compiles clean.

### Added
- **Env-config CLI + multi-tenancy ADR (platform foundation)** — tooling and decision docs, no
  runtime change.
  - `scripts/configure-env.mjs` (`npm run configure-env -- <staging|production>`) configures every
    required secret for an environment in one command, routing each to the correct store —
    **GitHub environment secrets** (`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`/`DIRECT_URL`, for
    CI) vs. **Cloudflare Worker secrets** (everything the app reads at runtime). Reads a gitignored
    `secrets/<env>.vars` (template: `secrets/example.vars`), validates all values are present, and
    pipes them via stdin so **no value ever appears in argv or logs**. `--dry-run` validates +
    shows routing without setting anything. Adds two required vars the original list omitted:
    `BETTER_AUTH_URL` (per-env origin) and `S3_REGION` (ADR-003). Documented in `docs/env-setup.md`
    (surfaced in the internal KMS).
  - **ADR-004 (draft)** — `specs/decisions/ADR-004-multi-tenancy.md`: the direction for a
    DB-driven multi-vendor platform (vendors/regions/branding as data, per-vendor theming over one
    business-logic/data layer), with open questions (tenant resolution, isolation model) to resolve
    before it's Accepted. Tracked by #49; also flags that **staging and production currently share
    one Neon database**.
- **P2.5b2 — Storefront visual redesign UI** (`specs/2026-08-07-p2-5b2-visual-ui/`), the UI half
  of P2.5b and the slice that closes the "live site is nowhere near the mockup" gap that opened
  P2.5 (closes #43). Applies P2.5b1's tokens/schema/seed to a real storefront matching the AI
  Studio mockup (`docs/ui-ref/`).
  - **Layout + header**: root `app/layout.tsx` drops the `max-w-2xl` body constraint that had
    silently narrowed every page since P2a; a new `app/(storefront)/layout.tsx` (`force-dynamic`,
    since it reads the session) hosts `components/layout/Header.tsx` — a **Server Component** (no
    client JS) with a promo bar, logo, GET search form, an auth-aware account control
    (`getSession()` → account link vs. "Sign in"), and an inert cart button (no count; no cart
    until P3). The layout adds no second `<main>` — pages keep their own.
  - **Hero homepage**: the M0 walking-skeleton `app/page.tsx` is removed and `/` is now served by
    `app/(storefront)/page.tsx` — a hero band, a data-driven department grid, and a postcode
    deliverability checker wired to P2.5b1's `isDeliverable()`. (`/api/health` is unchanged and
    remains the machine-readable health surface.) The checker lives on the hero, not the sticky
    header, because Next App Router layouts don't receive `searchParams` — only pages do.
  - **Redesigned `ProductCard`**: Halal/Fresh badges, a discount "Offer" badge + "Save £X" +
    strikethrough original price (derived from `originalPrice`), a star rating, `origin`, and an
    inert Add-to-Cart control. All brand colors come from semantic tokens (no raw hex); the gold
    rating star uses stock Tailwind `amber-400`, the one non-brand decorative color the design
    system already defers to Tailwind for.
  - **Category sidebar + speciality filters**: `components/layout/CategorySidebar.tsx`
    (presentational, receives categories as props) renders on the category and search pages;
    `ProductFilterForm` gains Halal/Fresh/Organic checkboxes wired to P2.5b1's real filter fields,
    with both pages parsing the params, passing them to the repository, and carrying them through
    pagination.
  - **Two data-layer additions surfaced during Orient** (not pure UI, so called out): (1)
    `ProductSummary`/`ProductDetail` now expose `averageRating`/`reviewCount` — P2.5a denormalized
    these *for the cards* but no read path ever selected them; (2)
    `components/product/category-icon.ts` maps a category slug to a lucide icon with a **generic
    default fallback**, so a category added to the DB later still renders an icon without a schema
    `iconName` field (honors the "auto-size to more categories" requirement).
  - **Dynamic-sizing / performance / auth** (explicit human requirements on #43): every grid and
    sidebar renders straight from `.map()` over DB results — no hardcoded 8-category/16-product
    counts; loading stays Server-Component + keyset-paginated (P2b's cursor pattern, reused); the
    header reflects real auth state, no mock.
  - **Deliberately excluded**: cart/Add-to-Cart wiring (P3), the Dev Control Toolbar (#41),
    `next/image`, a `Category.iconName` field, real photography, and a homepage "featured products"
    rail (no backing data — no featured field or list-all method exists yet).
  - **Post-preview adjustments** (from reviewing the running preview): the delivery area moved from
    Leicester (LE1–LE5) to **Milton Keynes (MK1–MK19)** — `isDeliverable()`, its test, and all
    locality copy (header/hero/metadata); the header now uses the **real logo** (`docs/logo.png`
    resized to `public/images/brand/logo.png`) in place of the "A" placeholder; and `globals.css`
    now forces `color-scheme: light` with an explicit white background + brand-ink text — a
    dark-mode browser was painting a dark canvas, making dark text on the transparent category
    cards unreadable.
- **P2.5b1 — Visual redesign foundation** (`specs/2026-08-07-p2-5b1-visual-foundation/`), first of
  two P2.5b slices (issue #40), split from a single oversized slice so tokens/schema/seed could be
  validated before P2.5b2's UI work (issue #43) consumes them.
  - **Design tokens**: `design-system/tokens/tokens.css` gains three tint primitives
    (`#E8F5E9`/`#FFF3E0`/`#FFEBEE`, confirmed against both the brand kit and the mockup's own
    `index.css`) as `--color-action-tint`/`--color-accent-tint`/`--color-danger-tint` — named
    relative to their base color, matching the existing hover/active-shade convention rather than
    inventing generic "success/warning" status vocabulary. `specs/design-system.md` (v1.1.0) also
    documents the brand kit's type scale as Tailwind utility mappings and resolves its two
    long-open items: real logo source (`docs/logo.png`, now committed) and red's dual role
    (alert/danger **and** sale-badge color, confirmed via the mockup's `ProductCard.tsx`).
  - `lucide-react` added — the mockup's actual icon library, not a guessed choice.
  - **Prisma**: `Product` gains `origin` (String?), `originalPrice` (Int? pence — a discount badge
    is derived from the gap to `basePrice` at render time, not a separate boolean that could drift),
    and `isHalal`/`isFresh`/`isOrganic` (Boolean, default false). `lib/repositories/products.ts`'s
    `ProductFilters`/`ProductSummary`/`ProductDetail` extended to match; `search()` and
    `listByCategory()` both route through the same `buildFilterWhere()`, so the three new filters
    behave identically from either entry point — no divergent behavior to maintain.
  - **Seed**: adds 6 categories (halal-meat, groceries, international, beverages, snacks,
    household) and 12 products, bringing the catalogue to 9 categories / 18 products — covers the
    mockup's 8 real departments plus the existing `bakery` (which the mockup doesn't have and isn't
    being removed; content parity matters more than exact slug parity with already-live URLs).
    **Bug caught mid-build**: the original seed script's idempotency check was a single
    `category.count() > 0` gate — since the existing 3 categories already exist in every
    environment, it would have silently skipped all 6 new categories forever. Rewritten to check
    per-category by slug, so partial catalogues extend correctly instead of getting stuck. New
    product images go through the same real `putObject()` storage round-trip as P2a's seed, never
    an external URL.
  - `lib/delivery.ts` — pure `isDeliverable()`, checks a postcode's LE1–LE5 (Leicester) prefix,
    case/whitespace-tolerant. No persistence; P3's checkout decides what to do with the result.
  - **Fixed while validating**: `docs/ui-ref/` (the mockup's committed reference source, its own
    separate Vite/React project) was never excluded from this repo's root `eslint.config.mjs`/
    `tsconfig.json`, so both `lint` and `tsc --noEmit` failed on code that isn't part of this app at
    all. Excluded, matching the existing pattern for `kms/site-internal`/`kms/site-public`.
  - **Corrected during build**: `requirements.md`/`plan.md` originally said "5 new categories...
    8 total" while separately listing 6 category names — an arithmetic slip, not a scope change.
    Fixed to 6 new / 9 total (12 new products / 18 total) before implementing, matching the
    enumerated list and the "add every mockup category we're missing" rationale that was always
    the actual intent.
  - **Deliberately excluded**: any layout/component/visual application of these tokens — P2.5b2
    (issue #43). Real product photography remains deferred per P2a's original note.
- **P2.5a — Ratings & reviews backend** (`specs/2026-08-07-p2-5a-ratings-reviews/`), first slice
  of P2.5 — a phase inserted into the roadmap after P2's close (closes #39, see `specs/
  roadmap.md` v1.2.0 for why: comparing the live site against the project's own AI Studio design
  mockup surfaced that ratings/reviews were never in the original P0–P8 plan at all).
  - **Prisma**: `Review` (one per user per product via `@@unique([userId, productId])` —
    resubmitting updates rather than duplicates; cascade-deletes with the user, matching
    `Session`/`Account`'s existing pattern). `Product` gains denormalized `averageRating`/
    `reviewCount`, recomputed from a full aggregate (not incremental, avoids float drift) inside
    the same transaction as every review write — matches `Inventory.quantity`'s existing
    denormalized-for-read-performance precedent, needed because ratings render on every
    paginated product-grid card.
  - `lib/repositories/reviews.ts` — `upsert`/`delete` (ownership-checked via a single atomic
    `deleteMany({ id, userId })`, not a read-then-check), `listByProduct`, `getByUserAndProduct`
    (pre-fills the submission form for a returning reviewer).
  - `features/reviews/` — **the first real use of `features/` since auth**, and for the same
    underlying reason: a genuine session-gated write use-case, unlike P2's read-only browsing
    which correctly stayed in `components/product/`. Two Server Actions
    (`submit-review.ts`/`delete-review.ts`) behind a plain `<form>` — no client component, same
    progressive-enhancement pattern as P2's GET forms.
  - `features/reviews/validate-rating.ts` — pure, unit-tested `parseRating()`, same pattern as
    `parse-price-input.ts`.
  - `app/(storefront)/products/[slug]` extended with a review list, the submission form for
    logged-in visitors, and a login prompt (not a redirect) for guests — browsing stays
    guest-accessible, no regression.
  - **Deliberately excluded**: review moderation (fits P6's admin panel better), verified-purchase
    gating (impossible before P3/cart exists), review-list pagination (bounded to the most recent
    20 for now), any visual/component redesign — all P2.5b (#40), once this lands.
- **P2b — Catalogue search & filters** (`specs/2026-08-07-p2b-catalogue-search/`), second and
  final P2 slice, closing out P2 (closes #34).
  - `lib/repositories/products.ts` gains `search()` (global, across all categories, same keyset
    cursor pagination as `listByCategory()`) and a shared `ProductFilters` shape
    (`minPricePence`/`maxPricePence`/`inStockOnly`) used by *both* `search()` and
    `listByCategory()` — one filter definition, not two parallel ones. Search matching is plain
    Postgres case-insensitive `contains` on `name`/`description` — `specs/architecture.md`
    explicitly defers a trigram index or a dedicated search service until the catalogue actually
    grows; this slice fulfills what was already decided there, doesn't reopen it. An
    empty/whitespace query returns no results, not the whole catalogue.
  - `app/(storefront)/search` — new route. `app/(storefront)/categories/[slug]` extended (not
    replaced) to accept the same price/availability filters.
  - `components/product/ProductFilterForm.tsx` — one shared component for both routes, a plain
    `<form method="GET">` with no client-side JS, matching P2a's zero-client-JS precedent
    (`<Link>`-based pagination). No hidden cursor field, so a filter change naturally restarts
    pagination at page 1.
  - `components/product/parse-price-input.ts` — pure, unit-tested counterpart to P2a's
    `formatPrice()`: parses a user-typed pounds string into integer pence for the repository
    layer, `undefined` (not `0`) for blank/invalid/negative input.
  - **Corrected assumption from `/propose`**: expected this slice would finally give
    `features/catalogue/` real content (client-side search interactivity). Didn't hold up — a
    plain GET form matches P2a's established pattern better than debounced client search, so
    `features/catalogue/` is still just `.gitkeep` after P2 in full.
  - **Deferred, not implemented**: typo-tolerant/fuzzy search. Real fuzzy matching needs
    `pg_trgm` and Prisma has no native wrapper for its `similarity()`/`%` operator, so it would
    mean both a new Postgres extension and `$queryRaw` (against `CLAUDE.md`'s no-raw-SQL rule) —
    and it's exactly the trigram work `specs/architecture.md` already defers until the catalogue
    grows past its current 6 placeholder products. Not a quick add; left flagged for whenever
    that condition is actually met.
  - `specs/roadmap.md`'s change log gains the **P2 closure entry**, and — noticed while adding
    it — **P0 and P1 never got their own closure entries either**, despite both being long done;
    backfilled retroactively (v1.1.0) so the log reads as a coherent history instead of jumping
    from M0 straight to P2.
- **P2a — Catalogue browsing** (`specs/2026-08-07-p2a-catalogue-browsing/`), first slice of P2.
  Split from the full roadmap line — search & filters follow separately as P2b (issue #34), same
  split pattern as P1a/P1b.
  - **Prisma**: `Category` (self-referential, slug/name/sortOrder/isActive), `Product`
    (slug/name/description/categoryId/basePrice pence/unitLabel/isActive), `ProductImage`
    (relative `storageKey` only, never a URL), `Inventory` (quantity/lowStockThreshold) — matches
    the representative schema already designed in `specs/architecture.md` §3.2. Migration applied
    directly to Neon staging (same pattern P1a used).
  - `lib/repositories/categories.ts` / `products.ts` — `CategoryRepository`/`ProductRepository`
    ports + Prisma implementations, constructed fresh per call (never cached across requests, same
    contract as `lib/db.ts`'s `getPrisma()`). Flat files, not a directory per domain — follows the
    flat-file precedent P1a set (`lib/auth.ts`) over `docs/repo-structure.md`'s stale sketch.
  - Keyset (cursor) pagination on product listings — cursor `(createdAt, id)`, never `OFFSET`, per
    `specs/architecture.md`'s pagination strategy.
  - `app/(storefront)/categories`, `/categories/[slug]`, `/products/[slug]` — category index,
    paginated product grid, product detail page. All publicly reachable, no auth regression.
  - **Bug caught by `npm run build`, not local `next dev`**: `/categories` (no dynamic segment) was
    getting statically optimized at build time — Next.js tried to prerender it in plain Node, but
    `lib/db.ts` loads Prisma via `@prisma/client/wasm`, which only works in the Workers runtime,
    so the build hard-failed (`Unknown file extension ".wasm"`). Same root cause as P1b's
    `/login`/`/register` fix; same fix here — `export const dynamic = "force-dynamic"` on all three
    new routes. Also means `specs/architecture.md`'s "Data Cache/ISR for catalogue pages" can't be
    Next's own SSG-based ISR while Prisma requires the Workers runtime — any caching for these
    pages needs to happen at Cloudflare's edge-cache layer instead, not attempted in this slice.
  - `components/product/` — `ProductCard`, `ProductImageGallery`, and a pure, unit-tested
    `formatPrice(pence)` helper (`450` → `"£4.50"`) — same pure-helper-alongside-I/O-code pattern
    as `lib/storage.ts`'s `composePublicUrl`.
  - Product images resolved via the existing `composePublicUrl(CDN_BASE_URL, storageKey)` — no raw
    R2/S3 URL ever rendered or stored.
  - `prisma/seed.ts` extended: seeds placeholder categories/products (real Aheed product data
    doesn't exist yet) and actually uploads a placeholder SVG through `lib/storage.ts`'s
    `putObject()` for each product image, proving the real storage round-trip. Uploads all images
    before writing any DB rows, and writes all rows in a single `prisma.$transaction` — found while
    validating locally: a mid-run failure (wrong/missing storage credentials) otherwise left an
    orphaned `Category` with zero `Product`s, which then silently broke the seed script's own
    idempotency check (`Category` count `> 0` → skip) on every subsequent run.
  - **Infra fix, found validating images against the real staging CDN domain**: R2's custom
    domain (`images.staging.aheedfoodcentre.nocaped.com`) was returning a Cloudflare
    `Cf-Mitigated: challenge` 403 on every request — confirmed via both a cookie-less `curl` and,
    once the browser extension was available, a real Chrome `<img>` tag load (broken-image icon),
    ruling out "just a bot-detection false positive." Turning off Bot Fight Mode alone didn't fix
    it; the actual cause was the zone's **Security Level** (Security → Settings), which issues a JS
    challenge independently of Bot Fight Mode. Lowered for this zone; re-verified 200 via both
    `curl` and a real browser afterward. Worth checking Security Level on **production**'s zone
    too before promoting, not just staging's.
  - **Still needed from the human before this is live end-to-end on production**: the same
    `S3_*`/`CDN_BASE_URL` Worker secrets confirmed on staging still need setting on production, and
    the Security Level check above repeated for production's zone.
  - Two persistent docs corrected against what this slice actually found, not just noted in this
    changelog entry: `specs/architecture.md`'s Caching section (the Data Cache/ISR claim above,
    v1.1.0) and `docs/repo-structure.md`'s `lib/` tree (flat files for single-adapter concerns —
    `db.ts`, `storage.ts`, `auth.ts`, `email.ts`, `config.ts` — vs. a real directory only for
    `lib/repositories/`, which genuinely holds multiple per-domain files; v1.1.0). The latter had
    already been contradicted once by P1a's `lib/auth.ts` without the doc being fixed — fixed now
    instead of deferring a third time.
- **`docs/onboarding.md` refreshed** — was still framed around M0-only ("Feature work (P0+) starts
  only after M0 is green"), badly stale now that M0/P0/KMS/design-system have shipped and P1a is
  in flight. Updated: current phase status (pointing at `specs/roadmap.md`'s change log as the
  source of truth, not duplicating it), `.env` vs `.dev.vars` distinction, the `npm run preview`
  vs `npm run dev` DB-touching gotcha surfaced immediately rather than buried in `CLAUDE.md`, the
  seven-stage SDD workflow + slash commands, and a pointer to the internal docs site. Verified no
  real duplication with `kms/site-internal/`'s content — that site auto-assembles from `specs/`,
  `docs/`, and `CLAUDE.md` (confirmed all 20 backfilled docs, including this one, assemble
  correctly), nothing hand-duplicated there. Its one stale line (`content/dev/index.mdx` said
  pages were "populated once those docs carry real front-matter" — no longer true post-backfill)
  fixed to point at the now-real content instead.
- **SDD — backfill missing `plan.md` files + prevent future drift.** 4 slices had drifted to a
  two-file (`requirements.md`/`validation.md`) pattern, missing `plan.md` — unintentional; started
  with the design-system slice and got entrenched when `specs/sdd-workflow.md`'s own `/spec` stage
  only mentioned the other two. Fixed:
  - `specs/templates/feature-spec/{plan,requirements,validation}.md` — scaffolded for the first
    time (`docs/repo-structure.md` documented this directory but it never existed), so future
    slices copy a real template instead of improvising from "the most recent slice."
  - `plan.md` backfilled for `design-system`, `kms-backfill`, `kms-gates`, `kms-site` — the
    narrative (goal, scope, deliberately-excluded, rationale) that front-matter now lives on,
    moved off `requirements.md` to match the established one-entry-per-slice precedent.
  - `kms/schema/repo.ts`'s `walk()` now excludes `specs/templates/` — the template's placeholder
    front-matter (`id: REPLACE-ME-...`) would otherwise hard-fail `kms:validate` once gate-wired.
  - `specs/sdd-workflow.md` and `.claude/commands/spec.md` now require all three files for every
    new slice, not just two.
  - `specs/2026-08-06-p1-auth/plan.md` lands separately, directly on PR #24's branch (doesn't
    exist on `staging` yet).
- **KMS — front-matter backfill** (`specs/2026-08-06-kms-backfill/`), closing the last deferred
  item from the KMS foundation slice (`specs/2026-08-06-kms/requirements.md` R8).
  `ARTIFACT_INDEX.md` now indexes 19 docs instead of 1: `CLAUDE.md`, all three `docs/*.md`, the 9
  persistent `specs/` docs (architecture, mission, roadmap, tech-stack, design-system,
  sdd-workflow, and the 3 ADRs), and one representative file per dated slice folder. Matches the
  precedent already set by `specs/2026-08-06-kms/plan.md`: one indexed entry per meaningful
  doc/slice, not every acceptance-criteria file — sibling `requirements.md`/`validation.md` files
  stay deliberately un-indexed. `specs/2026-08-06-p1-auth/requirements.md` is excluded from this
  slice (doesn't exist on `staging` yet, only on PR #24) — its front-matter lands with that PR
  instead.
- **P1b — Google Sign-In** (`specs/2026-08-06-p1b-google-signin/`), closing out P1's auth line on
  top of P1a below. Unblocked by the human provisioning the Google Cloud Console OAuth client and
  setting `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` as Cloudflare secrets on both `staging` and
  `production` (issue #28) — the one credential P1a's proposal had deferred as P1b.
  - `lib/auth.ts` — new exported pure `buildSocialProviders(env)`: returns a
    `socialProviders.google` block only when both credentials are present, `undefined` otherwise
    (never a half-configured provider). Split out specifically so it's unit-testable —
    `getAuth()` itself has no tests, since it depends on `getPrisma()`. `emailAndPassword`
    unchanged. No new Prisma migration — Google sign-ins land in the `Account` table P1a already
    created, and get `role: CUSTOMER` via the same Prisma default as email/password sign-up.
  - `lib/config.ts` gains `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, both optional (same
    degrade-not-crash pattern as `RESEND_API_KEY`) — documented in `.env.example` and
    `.dev.vars.example`.
  - `features/auth/components/GoogleSignInButton.tsx` — one shared "Continue with Google" control
    for both `/login` and `/register` (Better Auth's social sign-in creates an account on first
    use, so login and register need the same control, not two).
  - **Bug caught by `npm run build`'s route table, not local `next dev`**: `/login`/`/register`
    were being statically prerendered, which would have baked the Google-button visibility check
    in at *build* time — but `wrangler secret put` values only exist at Worker *request* time, so
    the button would have silently never rendered in production regardless of the secrets being
    set. Fixed with `export const dynamic = "force-dynamic"` on both pages (same pattern
    `/account` already uses).
  - **Deliberately incomplete**: the actual Google consent-screen flow can't be exercised against
    `npm run preview` locally — the OAuth client's redirect URIs are only registered for
    `staging`/`production`, not `localhost`. Verified as far as possible locally (the button
    renders/hides correctly, and `POST /api/auth/sign-in/social` returns a correctly-built Google
    authorization URL with the right `client_id`/scopes/PKCE challenge/redirect URI); the actual
    consent screen + callback need a real sign-in against a deployed environment before this is
    fully confirmed end-to-end.
- **P1a — `plan.md`** added (`specs/2026-08-06-p1-auth/plan.md`) — part of backfilling the
  `plan.md` file every slice is now required to have (issue #27); this one lands directly on this
  branch since the spec folder doesn't exist on `staging` yet.
- **P1a — Email/password auth, RBAC, account shell** (`specs/2026-08-06-p1-auth/`), split from the
  full P1 roadmap line since Google Sign-In needs a Google Cloud Console OAuth client only the
  human can create (tracked as P1b, issue #23):
  - **Prisma**: `User` (`role` enum — `CUSTOMER`/`STAFF`/`ADMIN`, default `CUSTOMER`), `Session`,
    `Account`, `Verification` — Better Auth's standard relational shape, no `Json` columns,
    explicit FKs. Migration applied directly to Neon staging (`prisma migrate dev` — confirmed
    with the user, no separate local Postgres exists); CI's `prisma migrate deploy` no-ops on it.
  - `lib/auth.ts` — Better Auth server instance (Prisma adapter, email/password, required email
    verification, password reset). `role` added via `additionalFields` with `input: false` so a
    signup request can never set its own role. No Google/OAuth provider — P1a is email/password
    only. `lib/auth-rbac.ts` — `requireRole()` gates a route/action to one or more roles, returning
    401/403 (never a silent pass-through) rather than throwing.
  - `lib/email.ts` — new `EmailService` port + Resend adapter via plain `fetch` (no SDK, same
    Workers-bundle-size reasoning as `lib/storage.ts`'s `aws4fetch` choice). Degrades to a logged
    no-op, not a crash, when `RESEND_API_KEY` is unset.
  - `app/api/auth/[...all]/route.ts`, and UI under a new `app/(storefront)/` route group:
    `/login`, `/register`, `/forgot-password`, `/reset-password`, a protected `/account` shell.
  - **Prerequisite fix, found stress-testing this slice against the real Workers runtime**
    (`npm run preview`, not `next dev` — see below): `lib/db.ts`'s `getPrisma()` cached a Prisma/
    Neon client across requests, which Cloudflare Workers forbids (I/O objects can't cross request
    boundaries) — rapid sequential requests failed ~1-in-3 times with `"Cannot perform I/O on
    behalf of a different request."` Pre-existing since M0 (affects `/api/health` too, just never
    caught — validation never hammered it with back-to-back requests). Fixed: `getPrisma()` and
    `getAuth()` now construct fresh per call rather than caching across requests, matching Neon's
    own recommended pattern for serverless/edge. Stress-tested clean afterwards.
  - `eslint.config.mjs` now excludes `.wrangler/**` (missed alongside `.next/**`/`.open-next/**` —
    running `npm run preview` locally left bundled worker output that `npm run lint` was linting
    as source, producing dozens of bogus errors from third-party code).
  - **Gate 3 fix, found validating locally against the `gates` CI job's actual env**: `lib/email.ts`'s
    `getEmailService()` called the shared `getEnv()`, which requires `DATABASE_URL`/
    `BETTER_AUTH_SECRET` — unrelated to email — so `tests/email.test.ts` failed in any environment
    without those two set (including CI, which never provides them for the test step). Split a
    narrow `getEmailEnv()`/`emailSchema` out of `lib/config.ts` covering only
    `RESEND_API_KEY`/`RESEND_FROM_EMAIL`; `getEmailService()` now depends on that instead.
  - **Still needed from the human before this is live end-to-end**: `RESEND_API_KEY` (a Resend
    account/key — verification and password-reset emails currently log-and-skip, don't send) and
    `BETTER_AUTH_SECRET`/`RESEND_API_KEY` set via `wrangler secret put` on staging/production.
  - **Discovered while validating, not fixed (documented for awareness)**: `@prisma/client/wasm`
    cannot load under plain `next dev` (Node.js runtime, not workerd) — any DB-touching route
    silently shows an error state under `npm run dev`. Always use `npm run preview` (OpenNext +
    local Workers runtime) to validate DB-touching code; `next dev` is UI-only from now on.
- **KMS — gate wiring** (`specs/2026-08-06-kms-gates/`), closing the last deferred item from the
  KMS design (`specs/2026-08-06-kms/plan.md` §2, `requirements.md` R8). `gates.yml` now runs
  `kms:validate` and an `ARTIFACT_INDEX.md` staleness check (regenerated and diffed with the
  `Last build:` timestamp normalized out, so the check is meaningful rather than always failing).
  Includes two prerequisite bug fixes found while grounding — wiring the validator as originally
  sketched would have broken every future PR:
  - `kms/schema/repo.ts`'s `walk()` now excludes `kms/site-*/content/` (assembled/generated site
    output) — it was indexing the same doc twice (source path + assembled copy) and wasn't even
    deterministic in CI, since that gitignored directory doesn't exist on a fresh checkout.
  - `kms/schema/validate.ts` now distinguishes "no front-matter" from "front-matter present but
    missing `visibility`" (the schema's own required, no-default field) — the latter is reported
    informationally, not hard-failed. Fixes false-positive failures on `.claude/commands/*.md`
    (Claude Code's own `description:` frontmatter) and Nextra's `title:`-only stub pages.
- **SDD workflow, generalized as keywords + slash commands** (`specs/sdd-workflow.md`,
  `.claude/commands/`). Expands CLAUDE.md's four gates (Propose/Spec/Validate/Changelog) into seven
  stages — **Orient → Propose → Spec → Build → Validate → Document → Ship** — each also an
  invokable slash command, generalized from patterns and failure modes actually hit running the
  process across the KMS and design-system-tokens slices (stale planning-doc traps, Windows
  `core.autocrlf` giving false `prettier --check` positives against real CI, PRs merging before a
  fast-follow commit landed, a Gate-4 CHANGELOG check whose diff base moves between pushes).
  `CLAUDE.md`'s gate section now points to it.
- **P0 — Design-system tokens** (`specs/design-system.md`, `specs/2026-08-06-design-system/`),
  closing the last item deferred from the P0 foundation slice below. Encodes the Aheed brand kit
  as real tokens rather than leaving Tailwind uninstalled:
  - Tailwind CSS v4, CSS-first `@theme` config (no `tailwind.config.ts` — v4's own recommended
    default; `docs/repo-structure.md`'s sketch of a JS config is stale, same as its now-wrong P6
    tag on `tsconfig.json`).
  - `design-system/tokens/tokens.css` — primitive brand-kit colors (`--color-brand-*`) layered
    under semantic tokens (`--color-primary`/`--color-action`/`--color-accent`/`--color-danger`/
    `--color-surface-muted`) plus radius tokens, so components read the semantic layer, never a
    raw hex. Two hover/active shades are derived (not brand-sourced) and commented as such.
  - Poppins loaded via `next/font/google` (self-hosted at build, no runtime request — matters on
    Workers), one family at two weights (400/600), not two families.
  - `app/globals.css`/`app/page.tsx` restyled with the tokens to prove they flow live, not just
    sit as unused config; the old hand-rolled `.card`/`.ok`/`.bad` CSS is gone.
  - Deliberately deferred: real logo source files (the brand kit is a reference image, not
    exportable assets), `components/`/`design-system/{components,patterns,pages,guidelines}/`
    (nothing consumes tokens yet), dark mode, and the hex/px-banning eslint rule (P6-tagged).
- **P0 — Foundation & scaffolding (first slice).** Hardens what M0 proved, scoped to what wasn't
  already built during M0's infrastructure work (`specs/2026-08-06-p0-foundation/`):
  - Local SDD git hooks (`hooks/pre-commit` — Gate 2 spec-before-code, `hooks/pre-push` — Gate 4
    changelog-before-merge), activated by the `core.hooksPath` wiring `scripts/bootstrap.sh`
    already had. Fast local feedback only — `gates.yml` in CI remains the real enforcement.
  - Prettier (`.prettierrc.json`, `.prettierignore`, `npm run format`/`format:check`), wired into
    `gates.yml`. Deliberately excludes `.md`/`.mdx` — Prettier's markdown table reformatting pads
    every cell to align columns, which wrecks readability on long-prose cells.
  - `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts` — the Next.js App Router convention for
    SEO/PWA metadata (route files under `app/`, not static files under `public/`). `robots.ts` is
    host-aware: only the production domain allows crawling, staging always disallows. No brand
    icon assets exist yet, so `manifest.ts` ships an empty `icons` array rather than fabricated
    placeholders — a real follow-up needing actual brand input.
  - `tests/setup.ts`, wired into `vitest.config.mts`'s `setupFiles` — loads `.env` for tests that
    read `process.env`.
  - Deliberately out of scope: design-system tokens (no `specs/design-system.md` spec exists yet),
    `lib/repositories/` (nothing to wrap until P1's catalogue models exist), and GitHub
    branch-protection rules on `main`/`staging` (a real gap, flagged as a follow-up recommendation).
- **KMS — front-matter schema & validator (foundation slice).** First piece of the knowledge-
  management system design (`specs/2026-08-06-kms/plan.md`): `kms/schema/frontmatter.ts` (the Zod
  contract — `id`, `title`, `audience`, `type`, `status`, `version`, `updated`, `visibility`,
  `summary`, `tags`; `visibility` has no default, so a doc can never silently become public) and
  `kms/schema/validate.ts` (`npm run kms:validate` — walks all `.md`/`.mdx`, hard-fails on invalid
  front-matter, warns on missing front-matter without blocking). `ARTIFACT_INDEX.md` moved to the
  repo root per the design's folder structure. Deliberately deferred to follow-up work: the index
  generator, the internal/public site assembly, CI gate wiring, and backfilling front-matter onto
  existing docs — see `specs/2026-08-06-kms/requirements.md` R8.
- **KMS — index generator, assembly & internal site** (`specs/2026-08-06-kms-site/`), the deferred
  follow-up to the schema/validator foundation slice above:
  - `kms/scripts/build-index.ts` (`npm run kms:build-index`) walks front-matter docs and regenerates
    `ARTIFACT_INDEX.md` grouped by track; deterministic output aside from its `Last build:` timestamp.
  - `kms/scripts/assemble.ts --visibility internal|public` (`npm run kms:assemble:internal`/`:public`)
    copies single-source docs into a site's `content/` by `visibility`, so doc bodies are never
    duplicated by hand. Both scripts share new `kms/schema/repo.ts` (walk/parse helpers factored out
    of `validate.ts`).
  - `kms/site-internal/` — a standalone Next.js + Nextra 4 app (own `package.json`, own toolchain,
    excluded from the root's lint/typecheck via `eslint.config.mjs`/`tsconfig.json`) serving
    assembled docs under `/dev`, with `/staff` stubbed. Its `wrangler.toml` targets a separate Worker
    (`aheed-kms-internal`) with `workers_dev = false` and the custom-domain route commented out —
    not internet-reachable until the human provisions DNS + a Cloudflare Access application gating it
    (zero-trust; the site has no auth of its own).
  - `.github/workflows/deploy-docs-internal.yml` mirrors `deploy-staging.yml`'s build-then-deploy
    pattern, triggered on push to `staging`/`main`. Safe to run before Cloudflare-side provisioning
    exists (no public route to expose), but won't do anything useful until it does.
  - The public site (track 3) stays stubbed — no storefront exists yet to document.
### Milestone
- **M0 — Walking Skeleton closed.** `/api/health` returns `db.ok: true` on both staging and
  production; `gates`, `deploy-staging`, and `deploy-production` all green end-to-end. Proceeding
  to P0 per `specs/roadmap.md`.

### Fixed
- `kms/scripts/assemble.ts`, `kms/scripts/build-index.ts`, `kms/site-internal/tsconfig.json`
  reformatted to satisfy `prettier --check` — missed locally because a Windows checkout
  (`core.autocrlf=true`) masks real formatting diffs behind line-ending noise; `gates` runs on
  Linux/LF and caught it. No logic changes. (Landed on `staging` via PR #10; this entry was
  originally missed there — see #11.)
- **M0 infrastructure fixes to actually reach `db.ok: true` in production:**
  - `PrismaNeon` adapter takes a `PoolConfig` (`{ connectionString }`), not a `Pool` instance.
  - `prisma/schema.prisma` generator now sets `engineType = "client"` — the default `"library"`
    engine calls `fs.readdir` at runtime, unsupported by workerd's `nodejs_compat` polyfill.
  - `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm` explicitly, not the bare
    `@prisma/client` specifier — Next's Node-based build tracer otherwise resolves the `"node"`
    export condition (`fs.readFileSync`-based loader) even though the code runs in workerd.
  - `package-lock.json` resynced with `package.json` (`npm ci` was failing in CI); restored the
    `allowScripts` allowlist needed for native postinstall scripts under npm 11+.
  - Wired up the GitHub Actions deploy pipeline: created the missing `staging` environment,
    populated `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`DIRECT_URL` secrets on both
    environments, set the Worker's own runtime `DATABASE_URL` secret (`wrangler secret put`),
    enabled R2 and created the image buckets. Disabled the competing Cloudflare Workers Builds
    git integration, which was misconfigured (wrong build command, no `--env`, skipped migrations)
    and racing against the correct GitHub Actions pipeline.

### Changed
- **Upgraded to Next 16 / vitest 4** (deliberate major-version adoption, not incremental):
  - `next lint` (removed in Next 16) replaced with plain `eslint .`; migrated `.eslintrc.json` to
    flat config (`eslint.config.mjs`) using `eslint-config-next/core-web-vitals`.
  - `dev`/`build` scripts pin `next ... --webpack` — Turbopack (Next 16's default) can't resolve
    `@prisma/client/wasm`'s subpath export (`Module not found`), even though webpack and the
    package's `exports` map both handle it fine.
  - `vitest.config.ts` → `vitest.config.mts` (vitest 4's native config loader warns on ESM syntax
    in a file loaded as CommonJS).
  - `tsconfig.json`: `jsx` → `"react-jsx"` (Next 16 requires the automatic runtime); added
    `.next/dev/types/**/*.ts` to `include`.
  - Restored `@neondatabase/serverless` to an exact pin (`0.10.4`, no caret) and
    `@opennextjs/cloudflare` to `^1.20.2` — both had drifted to older/looser ranges outside this
    change.

### Added
- **Milestone 0 — Walking Skeleton.** Minimal end-to-end app to validate the pivoted
  infrastructure before feature work: `HealthCheck` model, `/` page and `/api/health` route that
  read it back through Prisma → Neon.
  - Next.js on **Cloudflare Workers** via `@opennextjs/cloudflare` (`open-next.config.ts`,
    `wrangler.toml` with `staging`/`production` envs + custom domains + `nodejs_compat`).
  - `lib/config` (zod env with `getCloudflareContext()` fallback), `lib/db` (Neon serverless driver
    adapter, lazy singleton), `lib/storage` (S3-compatible port via `aws4fetch`, keys-not-URLs).
  - GitHub Actions: `gates.yml` (lint/typecheck/test + CHANGELOG check), `deploy-staging.yml`
    (auto), `deploy-production.yml` (manual approval via `production` environment). Migrations run
    in CI against `DIRECT_URL`; runtime uses pooled `DATABASE_URL`.
  - SDD assets: feature/bug issue forms, PR template, gate labels; M0 spec
    (`specs/2026-08-05-m0-walking-skeleton/`) and `docs/walking-skeleton-runbook.md`.
- SDD constitution + `specs/architecture.md` (Cloudflare Workers + Neon design, migration strategy).

### Changed
- Roadmap now begins with **Milestone 0 (Walking Skeleton)** ahead of P0, so infrastructure is
  proven end-to-end before scaffolding features.
- Hosting pivoted from GCP Cloud Run + Cloud SQL to **Cloudflare Workers + Neon** (revised ADR-001);
  object storage via the **S3-compatible API only** (ADR-003).

### Notes
- No feature code beyond the skeleton. Auth, catalogue, cart, checkout, and the design system
  arrive in P1+ behind their specs and gates.





