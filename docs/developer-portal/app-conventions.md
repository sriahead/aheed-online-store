---
id: app-conventions
title: "Application Conventions — per-layer invariants and the tests that enforce them"
audience: [dev]
type: doc
status: approved
version: "1.1.0"
updated: 2026-09-26
visibility: internal
summary: What makes a file correct in each layer of this app — "use server" modules, lib/repositories, staff panel pages under app/(admin), vendor-neutral user-facing copy, and React hooks — together with the tests that enforce each invariant mechanically.
tags: [conventions, repositories, server-actions, staff-panel]
---

# Application Conventions

A reader arrives here because they are **writing or changing a file in one of these layers**. Each
section states the invariant, then names the test that enforces it — several of these rules were
enforced only by prose for months and drifted, so the test name matters as much as the rule.

Runtime failures that survive a green build are in `runtime-pitfalls.md`. Folder layout is in
`repo-structure.md`. Design tokens and per-vendor branding are in `specs/design-system.md`.

## Server Actions (`"use server"` files)

- **A `"use server"` file may export ONLY async functions — nothing else, not even a plain constant
  used purely to seed `useActionState`.** The restriction is enforced at *runtime*, not build time:
  `next build`, `tsc --noEmit`, and `npm test` all stay green with a violating file, because none of
  them load the module through the flight-loader's action-dispatch path. The compiled bundle calls
  `ensureServerEntryExports([...allExportsOfTheFile])` unconditionally the moment *any* action from
  that file is dispatched — so a same-file value export (e.g. `export const initialFormState = {...}`
  living next to the real actions "for convenience") makes **every** action in that file 500 for
  **every** caller, real browser included, with `Error: A "use server" file can only export async
  functions, found object`. First hit in P6b1 (#159) — `features/admin/catalogue.ts` exported
  `initialCatalogueState` alongside `saveProduct`/`saveCategory`; nothing caught it until
  `npm run preview`'s live write rows at Validate. Keep any such state constant in a plain module
  (e.g. `lib/<feature>-form.ts`) and import it from the client component directly — never from the
  `"use server"` file itself.
- **A page needing both a per-row action and a bulk action over the same rows cannot nest one
  `<form>` inside another** — HTML forbids it outright. Bind a row's control to a form it isn't a
  DOM descendant of via the standard `form="<id>"` attribute on that `<input>`/`<button>`, pointing
  at a separate top-level `<form id="...">` elsewhere on the page; both stay real progressive-
  enhancement forms, no client JS. First used in the P7a fix (#162) for `/staff/orders`: each row
  keeps its own untouched single-order `<form action={advanceStatus}>`, and a row's bulk-select
  checkbox sits in the same `<li>` but carries `form="bulk-advance"` to bind to a separate
  `<form id="bulk-advance" action={advanceStatusBulk}>` rendered once above the list.


## Repository layer (`lib/repositories/*`)

- **A request-scoped facade (resolving a live Prisma client and/or the current vendor from request
  context) does not belong in the same file as the pure functions it wraps.** Every function
  exported from a `lib/repositories/<name>.ts` file is expected to take its Prisma client and
  `vendorId`/`userId` as **explicit parameters** and read no request context — that is what lets a
  plain `tsx` script (a validation harness, a seed script) import the module in real Node and
  exercise it directly, without a live Workers request. Adding a `getCurrentVendorId()`-calling
  factory to the same file — even one that only wraps the pure functions "for convenience" — breaks
  that property for the whole module, not just for itself: the file's own contract becomes true of
  *some* of its exports and not others, and a validator running the file's own literal check (grep
  for `getCurrentVendorId(`, `headers(`, `getAuth(`) will find it. Put the facade in a sibling
  `lib/<name>-service.ts` instead, matching `lib/auth-rbac.ts`'s existing pattern — a request-context
  wrapper living *beside*, not inside, `lib/repositories/`. First hit in P7b (#216, PR #223):
  `getDataRightsRepository()` was added to `lib/repositories/data-rights.ts` at Build for exactly
  this "convenience" reason, `build-notes.md` disclosed two smaller deviations from spec but not this
  one, and `/validate` caught it by running `validation.md`'s own R2 probe rather than re-deriving
  it. Fixed at `/fix` by moving it to `lib/data-rights-service.ts`; the facade also became a plain
  sync factory once it no longer needed a dynamic `import()` to stay loadable by the same file a
  `tsx` script has to import.
- **The rule has TWO halves, and they are enforced by two different tests. Both must pass.**
  - **Request context** — `tests/repository-purity.test.ts` (#252, CLOSED at P8.1b) fails if any file
    in `lib/repositories/*.ts` contains a *value* import of `next/headers`, `@/lib/tenant`,
    `@/lib/auth` or `@/lib/auth-rbac`. Type-only imports stay legal and are the documented pattern
    (`import type { getPrisma } from "@/lib/db"`). Whole-file, import-level, **no allowlist** — put
    the facade in `lib/<name>-service.ts` and it passes.
  - **Client injection** — `tests/repository-client-injection.test.ts` (#409) fails on a
    `getPrisma()`/`getPrismaWs()` **call expression** inside a repository file. AST-based, not a
    grep, because these files legitimately name both functions in prose and in
    `ReturnType<typeof getPrisma>` type positions. **Unscoped as of #411/#412 (2026-08-27): it walks
    every `.ts` file in `lib/repositories/` discovered from the filesystem**, so a newly added
    repository file is covered the moment it exists. It shipped in #410 scoped to an explicit
    four-file list because the other four files were still non-compliant; that list is gone and must
    not come back.
  Every repository module has a sibling service where one is needed: `cart`, `categories`,
  `customers`, `discounts`, `loyalty`, `order-lookup-rate-limit`, `orders`, `products`, `reports`,
  `reviews`, `roles`, `vendor`, `data-rights`, `promotions`.
- **When you convert an export, the client moves to the sibling service and the call sites keep the
  function's NAME.** #411/#412 imported each repository function into its service under a `…Repo`
  alias and re-exported a same-named wrapper, so 29 call sites changed only their import path. That
  is deliberate: across 26 conversions a rename is the mistake most likely to go unnoticed, and a
  type-only import (`import type { AdminProductRow }`) must keep pointing at the repository while
  the value import moves. **Sweep by symbol, not by name** — `features/admin/storefront.ts` imported
  `updateVendorStorefrontConfig as updateConfigRepo` and called it under the alias, so a grep for the
  function name reported zero call sites and made it look like dead code.
- **A repository export that resolves its own Prisma client cannot be run from a plain `tsx` script
  AT ALL — this is structural, not a matter of inconvenience, and it is why the client must be a
  parameter.** `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm`, which is mandatory on
  Workers (see the Database section). **Node cannot load that build's WASM query compiler**, so any
  call routed through `lib/db` dies with `PrismaClientKnownRequestError (ERR_UNKNOWN_FILE_EXTENSION):
  Unknown file extension ".wasm" for node_modules/.prisma/client/query_compiler_bg.wasm`. Measured
  2026-08-27 against the dev Neon branch: `getAvailableSpecialities(prisma, vendorId)` **passed** with
  a client the script built from the bare `@prisma/client` specifier (as `prisma/seed.ts` does);
  `getVendorConfig(vendorId)`, which resolved its own, **failed**; the identical query through the
  script's own client **passed**. Same query, same database — the only variable was where the client
  came from. `scripts/verify-repository-injection.ts` is the committed harness that demonstrates this.
- **This rule has now claimed a false enforcement THREE times, and the third is the most instructive.**
  The first two pointed at `tests/repository-vendor-scoping.test.ts` (a test about *scoping*, not
  *location*). The third was subtler: `tests/repository-purity.test.ts` genuinely enforces what it
  claims — but its docstring also asserted that "several **compliant** repository functions call
  `getPrisma()` internally while still taking `vendorId` explicitly," which quietly blessed the other
  half of the rule as optional. **32 of 109 exports across 8 files** had done exactly that, including
  every catalogue write, every product-image mutation, loyalty tier CRUD, discount create/deactivate,
  and the guest order-lookup **rate limiter** — a security control that could not be exercised outside
  a live request. Three separate repository docstrings (`customers.ts`, `reports.ts`, and
  `discounts-service.ts`'s "every export there takes `prisma`") asserted the property while the file
  violated it. **The transferable lesson beyond the earlier two: a test that correctly enforces its
  own invariant can still launder a second, unenforced invariant if its comments opine on one.**
  Scope a test's prose to what it checks; if it must mention a neighbouring rule, name the test that
  enforces that one, or say plainly that nothing does.
  **A FOURTH docstring turned up while finishing the conversion** — `lib/products-service.ts` said
  the repository's "admin write path takes `vendorId` explicitly for the same reason these reads now
  do, so a plain `tsx` script can exercise either without a live Workers request," false for all 14
  of those exports. Four files asserting the same untrue sentence is what a property nobody ever
  executed looks like; the fix is `scripts/verify-repository-injection.ts`, which now *runs* all four
  files' exports against a real database instead of asserting anything.
- **The conversion found three dead Prisma clients, and the reason nothing caught them matters more
  than the waste.** `updateProductForVendor`, `setPrimaryProductImage` and `quickUpdateInventory` each
  opened with `const prisma = getPrisma();` and then **never read it** — every statement ran on the
  transaction client. So each admin product update, image set and stock tweak constructed an
  HTTP-adapter `PrismaClient` and discarded it. They had also been recorded in #409's own plan as
  functions "needing both clients," a claim that survived into two issues and a spec before anyone
  checked the bodies. **`eslint.config.mjs` enables no `no-unused-vars` rule of any kind** (verified
  empirically — a file with an unused local lints clean), so nothing in `lint`/`typecheck`/`test`
  reports an assigned-and-never-read variable. Tracked as **#416**. Until that lands, an unused
  binding is invisible here: do not assume a variable is used because CI is green.
- **The reason it took three attempts is worth more than the fix.** This rule twice claimed an
  enforcement that did not exist: it said `tests/repository-vendor-scoping.test.ts` "allowlists all
  nine by name … so the list cannot quietly grow." Both halves were false. That test asks whether an
  exported function **queries a vendor-scoped model without taking a vendor id** — a question about
  *scoping*, not about *location*. It held six of the nine plus two functions that were never on the
  list, and was structurally blind to `getDiscountRepository`, `getWebhookOrderService` and
  `getGuestOrderLookupService`, because a facade that *delegates* to pure functions issues no Prisma
  call of its own for it to see. An earlier version of this rule also pointed at `getCartRepository`
  as the example to copy while `getCartRepository` was itself the defect, so a reader following it
  literally reproduced the problem. **The transferable lesson: a rule that names its own enforcement
  must be checked against that enforcement, or it becomes a rule that documents a guarantee nobody
  provides.**
- **`lib/repositories/roles.ts` was the hardest case and shows what a real fix looks like.** It was
  never on #252's list, and it had **no pure functions at all** — both exports resolved the vendor
  themselves and one ran its own `requireVendorRole("ADMIN")`. So it needed a *split written*, not a
  move: `listVendorTeam(prisma, vendorId)` / `applyVendorRole(prisma, prismaWs, vendorId, actor, …)`
  stayed, and `lib/roles-service.ts` performs the session check and passes the resulting actor in as
  **data**. That is what made the hierarchy rules (who may grant ADMIN, who may touch a platform
  admin, the last-admin self-demotion guard) testable at all — which authorization logic needs most.


## Staff panel pages (`app/(admin)/staff/*`)

- **Every page's `requireVendorRole(...)` refusal branch must render `<PanelRefusal>` — never
  `return null` or fall through silently.** **`app/(admin)/layout.tsx`** renders the portal shell
  (header, tier badge, "View store" link) around whatever the page returns, so a page that returns
  `null` on refusal still serves `200` with that shell and a blank content area — no "Staff only"
  message, easy to mistake for a loading state rather than a real refusal. (This line said
  `app/(admin)/staff/layout.tsx` until P7.5d+e; **no such file has ever existed** — the shell is one
  segment up, at the route group. The rule's substance was unaffected, but the path a reader would
  open to check it was wrong, which is the same failure mode as a ruling nobody can find.)
  **`tests/panel-refusal-coverage.test.ts` (#350, 2026-09-08) now enforces this mechanically**, so
  the paragraph below is history rather than the enforcement. It walks `app/(admin)/` on the
  filesystem, has **no allowlist**, and fails a page that calls `requireVendorRole(` without
  rendering `<PanelRefusal>` — or that returns `null` from an `auth`-conditioned branch. It matches
  **JSX element names on the parsed TypeScript AST, not text**, because several of these pages carry
  a comment saying the refusal branch renders `<PanelRefusal>` and never returns `null`, which
  satisfies any substring check on its own. Do not reintroduce a hand-maintained list.
  **The history is the reason the test exists.** This rule was enforced by the prose list that used
  to sit here — naming `categories`, `inventory`, `orders`, `products`, `reports`, `team`,
  `customers` and `staff/page.tsx` as compliant, plus `runbook` and `loyalty` as fixed — and by the
  time anyone checked it against the filesystem it was wrong in **two directions at once**. It never
  mentioned `storefront` (**#350**, the live `return null` instance, found while scoping P8.5b and
  fixed incidentally in `e3c9642` by a slice editing that page for something else) and never
  mentioned `discounts` (**the fourth instance**, hand-rolled markup, found only by walking all 25
  pages at #350's own `/propose` on 2026-09-08); meanwhile `components/staff/PanelRefusal.tsx`'s
  docstring still claimed `loyalty` kept a private copy three phases after **#136** converted it.
  Four instances (`runbook` #231, `loyalty` #136, `storefront` #350, `discounts` #350) across five
  phases, two of them invisible to the list that existed to prevent them. **#231's was the only one
  a user could have hit** — it fired at `/validate` on the exact signed-in-non-staff case that
  slice's own `validation.md` had flagged as never exercised.
  **`storefront` and `discounts` now both render `<PanelRefusal>` on refusal, same as every other
  page in this section** — that is what closed #350, and `tests/panel-refusal-coverage.test.ts` is
  what keeps it true from here, not a prose list. When adding a new `/staff/*` page, copy an
  existing one's refusal branch; the test will tell you if you forgot.
- **There are TWO navigation surfaces and a new page must be added to BOTH** —
  `components/staff/PanelNav.tsx` (the persistent nav) and `app/(admin)/staff/page.tsx` (the hub's
  cards). Until P9.2 (#612) neither was a superset of the other: the nav omitted `brands`,
  `customers` and `payments` while the hub omitted `bundles`, `promotions` and `storefront`, so
  three pages vanished from the chrome the moment a user navigated off the hub and three more were
  unreachable from it. **Nothing detected that for months because each file is individually
  correct** — the defect existed only in the *relationship* between them, which is the class of
  thing a per-file review structurally cannot catch, and which is why the fix was a test rather than
  an edit. `tests/staff-nav-parity.test.ts` now pins the two together and fails if either surface
  gains or loses a link the other lacks; it parses the literal hrefs out of both files rather than
  rendering them, because each gates part of its list behind a role check and rendering would test
  one viewer's slice rather than the full declared set. Three routes are excluded **by name, each
  for a stated reason**: `/staff` (the hub cannot link to itself), `/staff/errors` (platform-admin
  only — `PanelNav`'s `currentTier` prop cannot express that, so the hub carries it alone behind its
  own `auth.via === "platform-admin"` check) and `/staff/search-synonyms` (#602's open work). If you
  add a page and the parity test fails, add it to the other surface — do not add it to the exclusion
  list, which exists for routes that genuinely cannot appear on both.
- **As of #633 there are THREE surfaces, not two: a new `/staff/*` page must also be DOCUMENTED, and
  `tests/operator-doc-coverage.test.ts` fails until it is.** That test enumerates route directories
  from the filesystem — no hardcoded list — and requires each to carry exactly one section in one of
  the three operator guides (`docs/staff-playbook/staff-tabs-guide.md`,
  `docs/store-admin-guide/admin-tabs-guide.md`, `docs/platform-admin-guide/platform-admin-guide.md`),
  with seven labelled parts and a `Who can access` line that **matches the page's own
  `requireVendorRole` arguments** (an `auth.via !== "platform-admin"` refusal counts as
  platform-admin-only). Two consequences worth knowing before you hit them: the section lives in the
  guide matching the page's gate, not wherever is convenient; and a `####` heading *inside* a section
  terminates it as far as the parser is concerned, so keep sub-structure to bold labels and lists.
  Note also that this test's own test COUNT grows by four per staff page added, which moves the
  vitest baseline recorded above on a change that touches no test file at all.
- **The parity and coverage tests pin structure and permissions; NOTHING mechanically checks whether
  a documented capability exists.** `docs/store-admin-guide/admin-tabs-guide.md` shipped `approved`
  for weeks telling store admins they could issue Stripe refunds, invite staff members, and grant the
  Store Admin role. All three were false (**#629**), and a **fourth** — that the delivery fee, free
  delivery threshold and minimum order are editable — was found only at `#633`'s Build by tracing
  each claim to a real control, and filed as **#634** (those three `VendorConfig` fields are written
  by `prisma/seed.ts` and by nothing else in the panel). **When you add or edit an operator-guide
  section, trace every capability sentence to a form, link or action import on that page** — a
  capability that reads plausibly and matches a schema field is not evidence of a control, and this
  is the one class of documentation error no test in this repo can catch.
- **`isAdmin` in the hub is NOT the same question as "may this person open the page".** It is true
  for a vendor `ADMIN` as well as a platform admin, and it is additionally downgraded by the
  `admin-tier` cookie's "view as staff" simulation. `/staff/errors` refuses anyone whose
  `auth.via !== "platform-admin"` (#508 — a stack trace can reveal internal paths a vendor-scoped
  account has no reason to see), so gating its card on `isAdmin` would render a link every store
  admin can see and none of them can open. Gate a platform-admin-only card on `auth.via` directly.

## User-facing copy (storefront and staff panel)

The platform is multi-tenant (ADR-004) and its vendors do not sell the same things: Aheed sells
groceries, SriMart sells electronics, and more vendors are planned. Every string a shopper or a
store's staff reads must be right for **any** vendor.

- **Copy comes from the vendor, or it is neutral.** Take the vendor's name from
  `getCurrentVendorProfile()` (or `profile.name` passed down as a prop into a client component —
  no middleware can carry it). Take examples from the vendor's own data (e.g. `/shop-your-list`
  builds its placeholder from the vendor's in-stock product names, `lib/shopping-list-examples.ts`).
  Otherwise write neutral wording that names no product category ("order", not "grocery order";
  `product-name`, not `basmati-rice-5kg`).
- **Never write a vendor's name into a component or a default parameter.** A default is worse than
  a literal: every caller that forgets the argument silently advertises that vendor on every other
  storefront (`buildShareLinks`' old `storeName = "Aheed Food Centre"`, `#729`). Make the prop or
  parameter required instead.
- **Marketing claims are the vendor's, never the platform's.** A vendor copy setting that is unset
  **hides** its element rather than falling back to platform filler (`#239`; the `VendorConfig`
  model comment). Platform-written marketing is still a claim made on a vendor's behalf.
- The one sanctioned fallback is the no-vendor case (`profile?.name ?? "Aheed Food Centre"` in
  page metadata), which only a vendorless host reaches, and those are redirected to
  `/coming-soon`. The platform has no name of its own yet (KMS strategy U1).
- **Enforced by `tests/vendor-neutral-copy.test.ts`**: a denylist of the literals `#729` removed,
  scanned across `app/**/*.tsx`, `components/**/*.tsx` and `lib/referrals.ts` with comments
  stripped. It catches those strings returning, **not** new vendor-specific copy — that is still a
  review question. Check a new string against a second vendor (SriMart) before shipping it.
- **Grocery attributes on the staff product form** (Halal, Fresh, Organic, Vegetarian, Gluten free,
  HMC) and the "UK grocery" framing inside AI prompts are still shown or sent for every vendor.
  Gating them needs a vendor setting; tracked as `#905`, not a copy fix.


## React and Next.js hooks

- **A `useEffect` that listens for `pathname` changes to auto-close a UI element (e.g. a drawer/modal) must NOT include its `open` state in its dependencies.** If `open` is included, the act of opening the drawer changes `open` to true, which triggers the effect immediately and closes the drawer right back. Hit in P8: a cart drawer instantly closed on open because the builder passed `open` and `close()` into the dependency array to satisfy the lint rule. The correct pattern is to call the closure function unconditionally (e.g., `close()`) inside the effect, leaving `open` out of the dependency array, and if needed, explicitly silencing the specific lint rule (e.g., `react-hooks/set-state-in-effect`) for that line rather than changing the dependency semantics.

