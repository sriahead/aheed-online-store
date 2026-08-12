# P6b1 — Catalogue management: product, category & inventory writes (build notes)

Written at the end of Build, before the Clear. Nothing in this slice has touched a real database:
every check so far is `typecheck` / `test` / `lint` / `build` and static reading. **Treat every
claim about runtime behaviour below as a claim, not a result** — the whole DB-touching surface is
new, and `validation.md`'s live rows are where it gets proven.

## What changed and why

**The two catalogue repositories became read/write.** `lib/repositories/products.ts` and
`categories.ts` had no `create` or `update` anywhere — every exported method was a query, and rows
existed only because `prisma/seed.ts` made them. The new write functions sit at module level taking
`vendorId` as an explicit first argument (`createProductForVendor(vendorId, input)`), matching
`createCodeForVendor` from P5b and the `placeOrder(prisma, vendorId, input)` shape the workflow
calls out: a function that resolves its own tenant from request context cannot be exercised from a
plain script, and these functions' most important properties are exactly the ones a script needs to
prove.

**Admin reads are separate functions, not a flag on the storefront ones.** `listProductsForAdmin` /
`getProductForAdmin` / `listCategoriesForAdmin` / `getCategoryForAdmin` exist because every
storefront read filters `isActive: true` — correct there, and fatal here, since the owner's first
need after hiding a product is to find it again. Adding an `includeInactive` parameter to
`getBySlug()` would have put a boolean in the storefront's hot path whose wrong value silently
leaks hidden products to shoppers. Two functions with different names cannot be miscalled that way.
`listProductsForAdmin` is keyset-paginated on `(createdAt, id)`, reusing the storefront
`findPage()`'s ordering rather than inventing a second pagination scheme.

**`lib/catalogue-form.ts` holds every field rule, and knows nothing about Prisma, FormData or
sessions.** Same posture as `lib/staff-orders-query.ts` (P6a) and `lib/shopping-list.ts` (P3d). It
takes a `Record<string, string | undefined>` rather than a `FormData`, so the 28 unit tests need no
web-platform globals at all; `readForm(form, FIELDS)` does the conversion and lives beside the field
name constants so the names are declared once.

**`features/admin/catalogue.ts` is wiring and nothing else.** Both actions re-run
`requireVendorRole("ADMIN")` themselves — a server action is a public endpoint at a stable id, so
the page's gate protects the page, not the action. One action handles create and update, keyed on a
hidden `productId`/`categoryId`, so the form component never branches on mode.

**Five routes, keyed on `id`.** `/staff/products`, `/staff/products/new`, `/staff/products/{id}`,
`/staff/categories`, `/staff/categories/{id}`. This slice makes a slug editable for the first time,
so an admin URL keyed on slug would change identity when you rename the thing it points at —
`/staff/orders/{orderNumber}` keys on an immutable number for the same reason. `new` is a static
segment, which Next resolves ahead of `[id]`.

**`specs/architecture.md` 1.11.0 → 1.12.0** records the two-level category tree beside the
`Category` model. The self-relation is unbounded in the schema and this slice is the first thing to
enforce a depth cap, so the rule had to live where someone reads the model, not only in a dated
slice folder.

**`isUniqueViolation` was extracted** from `lib/repositories/discounts.ts` to
`lib/repositories/prisma-errors.ts` and is now imported by both. Slug collisions become a routine
human error the moment a person types slugs, and a second copy of the `"P2002"` magic string is how
two call sites drift.

## Decisions taken during the build

- **Errors are returned, not thrown.** `lib/catalogue-form.ts` returns
  `{ ok: false, error: { field, message } }`. P5b's discount-code action throws a private
  `InvalidFieldError` and catches it at the top; that works for one call site, but the `field` name
  is what lets the form highlight the offending input, and threading that through an exception is
  worse than returning it. R5 asked for "a named field error rather than a thrown exception"
  explicitly.
- **`composePublicUrl` is called by the page, not the form.** It lives in `lib/storage.ts` beside
  the `aws4fetch` signer, so importing it from a `"use client"` module would pull the signer and
  `lib/config` into the browser bundle. `ProductForm` takes pre-composed `imageUrls`. The
  storefront's `ProductCard` imports it directly only because it is a server component — worth
  knowing before "simplifying" the prop away.
- **Category deactivation is refused on the active→inactive *transition* only**, not whenever the
  submitted state is inactive. Testing the resulting state would make an already-inactive category
  that has active products impossible to edit *at all* — including impossible to rename or
  re-activate. That state is reachable today: nothing stops a product being activated under a
  hidden category.
- **The refusal names its blockers** ("3 active products and 1 active sub-category") rather than
  cascading the deactivation down. One click quietly rewriting an unbounded number of rows the
  owner never saw is the wrong default when there is no undo.
- **The parent picker offers only top-level categories, and never the category being edited** —
  mirroring the repository rule rather than replacing it. The server re-checks both, because a
  `<select>` is a form field and a form field is untrusted; the filtering just stops the UI inviting
  a refusal it already knows about.
- **Create redirects to the edit page; update returns state.** A newly created product has nowhere
  else to go. `redirect()` throws, so it sits after every `try` by construction.
- **`sortOrder` is validated as a non-negative integer.** The spec only required it persist. Zero is
  the schema default and negative sort orders have no meaning in the storefront's `orderBy`.
- **Product create nests the `Inventory` create** inside `prisma.product.create` rather than making
  two calls, so both commit in one implicit transaction. Update uses `inventory.upsert`, which is
  what lets a product seeded before this slice gain its first `Inventory` row on save instead of
  failing on a missing record.
- **`<img>` is left unsuppressed.** `CartContents` and `Header` carry
  `eslint-disable-next-line @next/next/no-img-element`, but `ProductCard` and `ProductImageGallery`
  — the two *product-image* components — do not, and the rule is a warning, not an error. Matching
  the product-image precedent keeps `npm run lint` at 0 errors and keeps R27's "no new
  `eslint-disable`" check honest.

## Deviations from the spec

- **`validation.md`'s R33 row was rewritten during Build.** As written it grepped the *whole* diff
  for `.delete(`/`.deleteMany(` near `product`/`category`/`inventory`/`productImage` — and
  `requirements.md` and `validation.md` describe that check in prose, so the spec matched itself and
  the only way to "pass" would have been to delete the requirement. This is precisely the trap
  P4a hit twice (R5, R27) and that `sdd-workflow.md` warns about. The row now scopes the diff to
  `lib/ features/ app/ components/` and says why. **The requirement (R33) is unchanged** — only the
  method of checking it. Verified 0 matches in source.
- **`requirements.md` R11 was extended before the spec commit**, not during Build, to add the
  keyset-pagination clause. Noted only so a reader diffing the spec commit against the Propose
  discussion isn't surprised.

Otherwise none. Nothing was built beyond `requirements.md`, and the two gaps noticed during the
build (below) became issues rather than silent additions.

## Known-shaky areas

Ranked by where I'd look first. **Everything here is unexercised against a real database.**

1. **`update`/`upsert` with a non-unique field in `where`.** `product.update({ where: { id,
   vendorId } })` and `inventory.upsert({ where: { productId: id, vendorId } })` rely on Prisma's
   extended-where-unique. It typechecks, which is the *only* evidence so far. If Prisma 6.19 +
   `@prisma/adapter-neon` handles this differently at runtime than the types promise, every product
   update is affected. Check the generated SQL actually carries `AND "vendorId" = $n` — R10's whole
   guarantee rests on it.
2. **The cross-vendor category defence (R15).** `assertOwnCategory` is the *only* thing stopping a
   form submitting another vendor's `categoryId`; `Product.categoryId`'s foreign key carries no
   vendor. Never run. Worth driving headlessly with a real SriMart category id against the Aheed
   host, per the workflow's server-action notes, and confirming counts are unchanged on **both**
   vendors.
3. **The `Inventory` nested create and upsert (R13, R14).** The claim that create is one transaction
   is a claim about Prisma's nested-write semantics, not something I observed. R14's path — a
   product with *no* `Inventory` row — needs the row deleted by hand first; nothing in the seed
   produces one.
4. **`redirect()` inside a `useActionState` action.** Standard Next, but this codebase has never
   done it: every other admin action returns state. If it misbehaves under the Workers runtime it
   will look like "create silently does nothing".
5. **Category deactivation refusal (R18).** The transition-only rule and the blocker-counting
   message are both untested. The `Promise.all` count pair is read-then-write with no lock — two
   admins deactivating a category and activating a product concurrently could interleave. Judged
   acceptable (unlike stock or discount codes, nothing here is a money or oversell race, and the
   worst case is a hidden category with a visible product, which is already reachable), but it is a
   deliberate non-guarantee, not an oversight.
6. **`revalidatePath` coverage.** I guessed at which storefront paths need busting after an edit —
   `/products/{slug}`, `/categories` and `/` as layouts. A renamed slug revalidates the **new** path
   only; the old one may serve stale copy until it expires. Worth checking what actually goes stale
   rather than trusting the list.
7. **Slug edit vs. existing links.** Nothing rewrites or redirects the old URL. A renamed product's
   old `/products/{old-slug}` 404s. Correct-by-omission for a shop that has never been open, but a
   real consideration once it is.
8. **`format:check` on Windows.** The repo-wide run flags 32 files including several this slice
   never touched — the known CRLF false positive. I verified my own files by normalising line
   endings and fixed the four with genuine issues. **CI on Linux is the authority**; if it disagrees
   with this, believe CI.

## Fix — the write path was completely broken (found at Validate, item 1 above was right to flag it)

`npm run preview` proved every single `saveProduct`/`saveCategory` submission — real form or
otherwise — returned HTTP 500. Root cause: `features/admin/catalogue.ts` is `"use server"`, and
besides the two actions it also exported `initialCatalogueState`, a plain object. Next requires
every export of a `"use server"` file to be an async function; the compiled bundle calls
`ensureServerEntryExports([saveProduct, saveCategory, initialCatalogueState])` unconditionally at
module load (`node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js`),
so loading the module for *either* action always threw, independent of transport or request
shape — confirmed by reading the compiled Worker chunk directly, not inferred from one failing
request.

**Fix:** moved `CatalogueFormState` and `initialCatalogueState` out of `features/admin/catalogue.ts`
into `lib/catalogue-form.ts` — the pure, DB-free module they conceptually belong in anyway, matching
R1's posture. The `"use server"` file now exports only `saveProduct` and `saveCategory`.
`components/staff/ProductForm.tsx` and `CategoryForm.tsx` import `initialCatalogueState` from
`lib/catalogue-form` instead of `features/admin/catalogue`; `saveProduct`/`saveCategory` are
unchanged imports. No behavioural change to either action's logic.

**Re-verified live**, not just by re-reading code: rebuilt, re-signed-in as `demo-admin`, resubmitted
the exact product-create request that previously 500'd — it now 303-redirects to the new product's
edit page, and the created row reads back with the correct name and the correctly-derived slug
(`validation-rice-r3`). Test row deleted afterward.

This was invisible to `npm run build`, `npx tsc --noEmit`, and `npm test` — none of them load the
action module through the flight-loader's runtime path, so the whole pre-flight suite stayed green
throughout. Only exercising the actual write caught it. Worth remembering next time a `"use server"`
file grows a same-file constant "for convenience."
