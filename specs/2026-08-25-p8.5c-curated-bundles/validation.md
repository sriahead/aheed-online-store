# P8.5c — Curated Bundles (validation)

> **Run this first — this slice ships a migration.** CI applies migrations via `prisma migrate
> deploy` only at merge, so at `/validate` staging's schema is still one migration behind this
> branch. Before any write-path or live-render row below, run `npm run db:migrate` (or
> `db:migrate:dev`) against `DIRECT_URL`. It is additive and safe. Skipping it does not produce a
> soft failure — the add-to-cart rows throw a real Postgres error that looks exactly like a code
> defect. Confirm with `npx prisma migrate status` before starting.

> **Check which database the Worker is on before trusting any live result.** `npm run preview` reads
> `.dev.vars`; `db:migrate` and any inspection script read `.env`. Diff both against
> `secrets/staging.vars` and `secrets/production.vars` — two files agreeing is not evidence they
> agree on the *right* target (see CLAUDE.md's P5a incident).

> **DB-touching rows use `npm run preview`, never `npm run dev`.** Plain `next dev` cannot load
> `@prisma/client/wasm` and renders a silent error state.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -A 20 "^model Bundle {" prisma/schema.prisma` shows every listed field with the stated types/modifiers, plus `@@unique([vendorId, slug])` and `@@index([vendorId, isActive])`. |
| R2  | `grep -A 12 "^model BundleItem {" prisma/schema.prisma` shows the listed fields, `@@unique([bundleId, productId])`, and `onDelete: Cascade` on the `bundleId` relation. |
| R3  | Extract the two model blocks (`awk '/^model Bundle \{/,/^\}/' prisma/schema.prisma` and the same for `BundleItem`) and confirm no line **declares** a field whose name matches `/[Pp]rice\|[Ss]aving/` — i.e. match the field-declaration syntax (name then type at the start of a body line), not a bare word over the file, since the schema comments and `plan.md` name these fields deliberately to explain their absence. |
| R4  | Against a non-production Neon branch: `npx prisma migrate dev --create-only`, read the generated SQL and confirm it contains only `CREATE TABLE "Bundle"` / `CREATE TABLE "BundleItem"` plus their generated indexes and FK constraints, with no hand-written statement; then `npx prisma migrate deploy && npx prisma migrate status` — reports applied, schema in sync, no drift. |
| R5  | `npm run db:seed` twice against a non-production branch. After each run, query `Bundle` grouped by `vendorId` — Aheed has ≥2, SriMart ≥1, counts identical across both runs, and every `BundleItem.productId` resolves to a `Product` with the same `vendorId` as its `Bundle` (a join returning zero mismatched rows). |
| R6  | `grep -n "^export async function\|^export function" lib/repositories/bundles.ts` lists all six names; read each signature and confirm `prisma` (and `vendorId` where vendor-scoped) are explicit parameters. |
| R7  | `npx vitest run tests/repository-purity.test.ts` exits 0. Confirm the file is actually in scope (not silently skipped) by temporarily adding `import { headers } from "next/headers";` to `lib/repositories/bundles.ts`, re-running to watch it **fail**, then reverting — the same live demonstration P8.1b used. |
| R8  | `grep -n "getPrisma\|getCurrentVendorId\|headers(" lib/bundles-service.ts` shows the request-scoped calls present there; the same grep against `lib/repositories/bundles.ts` returns nothing. |
| R9  | Under `npm run preview` with ≥3 seeded bundles, count the Prisma queries issued by one `/categories` render (Prisma `log: ['query']` or a wrapping counter in a `tsx` harness calling `listActiveBundles` directly). Query count must not increase when a fourth bundle is added to the same vendor. |
| R10 | `npx vitest run` on the new pricing unit test: cases for a single item at quantity 1, an item at quantity 3, a multi-item bundle, and an empty item list — each asserted against a hand-computed `basePrice × quantity` sum. Assert results are integers (`Number.isInteger`) — a float anywhere fails the row. |
| R11 | Unit test with a fixture where one constituent has `isActive: false` and a second has `Inventory.quantity: 0`: neither appears in the returned total or the returned item list, and the total equals the sum over the remaining items only. |
| R12 | Fetch `/categories` under `npm run preview` and read the rendered HTML — the bundles `<section>` appears after the department-scroller section and before the "New Arrivals" heading, by document order of those three markers. |
| R13 | Same HTML: for one seeded bundle, its name, its tagline text, one entry per available constituent (product name + quantity), and a price string matching `formatPrice`'s output format are all present within that bundle's card markup. Cross-check the price against the total computed by hand from the seeded constituents' `pricePence`. |
| R14 | Two parts. **(a)** Seed every constituent of one bundle with `originalPrice` null, fetch `/categories`, extract only that bundle's card markup, and confirm it contains exactly one price string and no `line-through`/`<s>`/`<del>` element and no "Save" text. **(b)** Set `originalPrice > basePrice` on one constituent of that same bundle and re-fetch — the constituent's own badge SHOULD now appear (it is a true statement about that product, live since P2.5b1), while the bundle's own price row still shows a single derived total with no bundle-level saving. **A blanket `/save/i` grep over the section fails part (b) by construction and must not be used** — target the bundle's price row, not the section's text. |
| R15 | Seed or update one bundle with `imageKey: null` and fetch `/categories` — that card's markup contains its name, constituent list, total and add control, and contains no `<img>` with an empty/undefined `src` and no zero-size reserved image container. |
| R16 | `git diff origin/staging..HEAD --stat -- "app/(landing)/page.tsx"` is empty. |
| R17 | Set one bundle `isActive: false` and zero the stock of every constituent of a second; fetch `/categories` — neither bundle's name appears in the response body, while a third, healthy bundle still does. |
| R18 | `grep -n "\$transaction\|cartItem\." features/cart/add-bundle-to-cart.ts` (or wherever the action lands) returns nothing, and `grep -n "addItems" ` on the same file shows the call. |
| R19 | `git diff origin/staging..HEAD -- lib/repositories/cart.ts` is empty. |
| R20 | Under `npm run preview`: add one constituent product to the cart directly (quantity 1), then add the bundle containing it at quantity 2. Read `CartItem` for that product from the DB — quantity is 3, or the available stock if lower. |
| R21 | Zero the stock of exactly one constituent of a seeded bundle, then submit the add action headlessly (`node:http` with `{ setHost: false }` and an explicit `Host` header, per the workflow's server-action notes). The response page names the unavailable product; a DB read confirms the other constituents were added. Repeat with all constituents in stock and confirm no such message renders. |
| R22 | Fetch `/categories` as a guest with no cookies, with bundles rendering. Response carries no `Set-Cookie` for the cart token, and a DB read shows no new `Cart` row. Then submit the add action and confirm the token is issued and the `Cart` row created at that point. |
| R23 | Submit the add action with (a) a bundle id belonging to the other seeded vendor and (b) a random UUID. Both return a normal response (not a 500), and a DB read confirms no `CartItem` was written for the acting identity in either case. |
| R24 | Signed in as a vendor ADMIN under `npm run preview`, load `/staff/bundles` — every seeded bundle for that vendor is listed with its constituent count and active state, and each row links to its edit form. |
| R25 | Sign in as a plain customer account and load `/staff/bundles` — the response contains `<PanelRefusal>`'s rendered text pattern (match against `/staff/categories`'s refusal output), and does not contain the bundle list markup. Confirm the status is not 500. |
| R26 | Through the live UI under `npm run preview`: create a bundle, add three constituents with quantities 1/2/1, save, reload and confirm all persisted; remove one constituent, save, reload; change `sortOrder` and confirm the storefront order changes to match. |
| R27 | For every file this slice adds containing `"use server"`, `grep -n "^export" <file>` shows only `export async function` lines — no `export const`. Enumerate the files with `git diff --name-only origin/staging..HEAD -- features/`. |
| R28 | Call the save action directly (a `tsx` script or unit test) three times: `quantity: 0`, `quantity: 1.5`, and a `productId` from the other vendor. Each returns an error result; a DB read after each confirms nothing was written. |
| R29 | Create a bundle with an existing slug for the same vendor through the action — an error result is returned and rendered; the response is not a 500 and the server log shows no unhandled `P2002`. |
| R30 | Call the attach-image action with (a) a key for a different bundle id, (b) the same key without `.webp`, (c) a key with an extra path segment. All three refused; no row updated. |
| R31 | Submit the save action with `imageKey` set and `altText` empty — error result returned, and a DB read confirms neither `imageKey` nor `altText` was written. |
| R32 | `grep -n "from \"@/lib/product-image\"" components/staff/BundleImageUploader.tsx` shows the four names imported; `grep -n "IMAGE_QUALITY\s*=\|MAX_IMAGE_EDGE_PX\s*=" ` on the same file returns nothing (not redeclared). |
| R33 | `npm run lint && npm run typecheck && npm test -- --run && npm run format:check && npm run build` — all exit 0. If `format:check` flags files this branch did not touch, treat it as real drift and read the diff; the `core.autocrlf` artifact was fixed in PR #328 and is no longer the expected explanation. |
| R34 | `npm run kms:validate` exits 0. Then `npm run kms:build-index` **last**, after every front-matter edit, and confirm `ARTIFACT_INDEX.md` lists this slice's `plan.md`. Compare with the footer normalised away (as `gates.yml` does with `sed`) — a bare `git diff --exit-code ARTIFACT_INDEX.md` always shows a one-commit footer difference by construction and is not a real failure. |
| R35 | `git diff origin/staging..HEAD -- CHANGELOG.md` is non-empty and its entry states that no savings claim ships in this slice. |
| R36 | `grep -n "PR #371" specs/roadmap.md` returns a change-log row for the promotion. Then `npm run sdd:audit` — the PR #371 promotion is reported as cited, not pending or missing. |
| R37 | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` completes successfully. Also confirm no file added under `specs/` or `docs/` contains a bare `<` immediately followed by a digit, which breaks the MDX build with no signal from the root gates. |
| —   | **CI is the real Gate 3.** Do not report this slice done until `gates` is green on GitHub, not on the strength of local output. |
