# P8.5c — Curated Bundles (build notes)

Build ran in the **main checkout** (`E:\GitRepositories\aheed-online-store`), branch
`feature/p8.5c-curated-bundles`, off `origin/staging` at `476d3b7`. **No sub-agent worktree was
used** — `git worktree list` shows only the main checkout, so nothing lives outside this branch.

Spec commit `e1aa89c`, implementation commit `cbe15cf`.

## What changed and why

**The slice is deliberately thin at the cart, and that is the design.** `addCartItems`
(`lib/repositories/cart.ts:300`) already runs one transaction for a whole list of lines and already
collapses duplicates through `sumLinesByProduct`. So "Add all N to basket" resolves the bundle's
constituents into `MergeLine[]` and hands them to that existing function. Nothing about checkout,
stock decrement, Stripe, loyalty or discounts changed, because after the add the cart holds ordinary
`CartItem` rows and no downstream path can tell they came from a bundle. `lib/repositories/cart.ts`
is byte-identical to `origin/staging` (R19).

**No stored price, anywhere.** `Bundle` and `BundleItem` have no price or saving column at all. The
total is summed from constituents' live `Product.basePrice` at read time by `lib/bundle-pricing.ts`,
a pure module with no database import. The prototype's own `BundleItem`
(`docs/ui-ref-revised/src/types.ts:116`) stores `price`, `originalPrice`, `badge` and a hand-written
`savingsText`; that shape was rejected at `/propose` and none of it was ported.

**Layering.** `lib/repositories/bundles.ts` takes `prisma`/`vendorId` as explicit parameters and
imports `@/lib/db` **type-only**; `lib/bundles-service.ts` is the sibling request-scoped facade.
`tests/repository-purity.test.ts` enumerates `lib/repositories/*.ts` with `readdirSync` and has no
allowlist, so the new module was covered the moment it existed — nothing had to be registered.

**Vendor scoping is the untrusted-input defence.** `getBundleWithItems` puts `vendorId` in the
`where`, so another vendor's bundle id (or a random uuid) is indistinguishable from one that does not
exist. `upsertBundle` and `setBundleImage` use `updateMany` rather than `update` for the same reason
— a `where` carrying `vendorId` updates zero rows instead of someone else's. `setBundleItems`
re-checks every submitted `productId` against the vendor rather than trusting the form.

**One query for the section.** `BUNDLE_INCLUDE` pulls each bundle's items, their products and those
products' inventory in the same `findMany`, so a fourth bundle adds no query (R9). This is the same
N+1 avoidance `listCategorySpotlights` was written for in P8.5b.

**Files added:** `lib/bundle-pricing.ts`, `lib/bundle-form.ts`, `lib/bundle-image.ts`,
`lib/bundle-notice.ts`, `lib/repositories/bundles.ts`, `lib/bundles-service.ts`,
`features/cart/add-bundle-to-cart.ts`, `features/admin/bundles.ts`,
`features/admin/bundle-image.ts`, `components/bundle/BundleCard.tsx`,
`components/bundle/BundleRow.tsx`, `components/staff/BundleForm.tsx`,
`components/staff/BundleImageUploader.tsx`, `app/(admin)/staff/bundles/page.tsx`,
`app/(admin)/staff/bundles/[bundleId]/page.tsx`, the migration, and two test files.
**Modified:** `prisma/schema.prisma`, `prisma/seed.ts`, `app/(storefront)/categories/page.tsx`,
`app/(storefront)/cart/page.tsx`, `components/staff/PanelNav.tsx`.

## Decisions taken during the build

**Availability is resolved in the action, above the cart.** `addCartItems` filters out-of-stock
lines and returns `void` — it cannot report that two of four constituents were unavailable, and a
shopper who clicks "Add all 4" and silently receives 2 has been misled. The alternative was changing
`addCartItems` to return a result, but `addListToCart` (P3d) and the merge path also depend on it, so
that would reshape a shared transaction-carrying write path to serve one new caller's reporting
need. The action already reads the constituents to build its lines and their stock arrives in the
same query, so doing it there costs nothing and leaves the shared path alone. **Accepted
imprecision:** stock is read before the write, so another shopper can take the last unit in between.
The write path still clamps, so no overselling becomes possible, but the message can be marginally
optimistic in that race.

**The unavailable-items notice travels as a query parameter**, `/cart?unavailable=A|B`, parsed by
`lib/bundle-notice.ts`. Rejected: a flash cookie (new state to store and expire, for one message).
`UNAVAILABLE_SEPARATOR` and `parseUnavailableNames` live in that plain module rather than in
`features/cart/add-bundle-to-cart.ts` because that file is `"use server"` and such a file may export
**only** async functions — the P6b1/#159 trap, which 500s every action in the file at runtime while
`build`, `tsc` and `vitest` all stay green.

**`saveBundle` writes details and constituents sequentially, not in one transaction.** Wrapping both
would mean threading a transaction client through `upsertBundle`, whose whole value is being callable
from a plain `tsx` script. The failure mode is "the name saved and the item list didn't", which the
admin sees on the re-render and can resubmit; there is no data-integrity consequence. The item
replacement is itself atomic (`setBundleItems` does `deleteMany` + `createMany` inside one
transaction, so a concurrent reader never sees a briefly-empty bundle).

**`setBundleItems` replaces the whole list rather than exposing add/remove.** The staff form submits
every row on every save, so a per-row API would need a diff the form has no reason to compute.

**The product picker offers active products only**, capped at 200. A bundle built from an inactive
product would render with that line silently dropped by the availability rule, which looks like a bug
from the admin's side.

**Bundles are seeded by product _slug_, not id**, so the fixture stays readable and survives a
`migrate reset`. A fixture naming a product that doesn't exist logs a **warning and skips**, rather
than creating a bundle with no constituents — the #276 lesson applied to a new seeder.

**Migration generated by datamodel diff** (`prisma migrate diff --from-schema-datamodel
<git show HEAD:prisma/schema.prisma> --to-schema-datamodel prisma/schema.prisma --script`) rather
than `migrate dev`, which needs a shadow database. Output is purely generated DDL; nothing was
hand-authored.

**No "Auto-Generate" button on `BundleImageUploader`**, unlike `CampaignBannerUploader`. The AI
banner route builds its prompt from a campaign's headline; an equivalent for bundles needs its own
route and its own prompt decision, which is outside these requirements. Filed as **#372**.

## Deviations from the spec

**One, and it is the one thing to read this file for: `requirements.md` R14 contradicts itself, and
I did not edit the spec to resolve it.**

R14(a) requires a bundle card to show "exactly one price — the derived total". R14(b) requires that a
constituent which is itself on offer still shows "its own badge" on that card. Those cannot both
hold: a per-constituent badge is a second price on the card.

I built to **R14(a)**. `BundleCard`'s constituent list shows quantity and name only, with no
per-item prices and no badges; the card carries exactly one price, the derived total. My reasoning:
a per-constituent price row is exactly where a "Save £X" would sit, and repeated three times down a
bundle card that phrase reads as a *bundle* saving — the single claim this slice must not make while
P8.5d doesn't exist. Leaving prices off the lines removes the temptation structurally instead of
relying on wording.

R14(b)'s actual purpose — *don't delete a correct pre-existing feature* — is still satisfied:
`ProductCard`'s "Save {formatPrice(saving)}" and struck-through `originalPrice` (live since P2.5b1,
`components/product/ProductCard.tsx:88`, `:134`) are untouched everywhere they really live: the
product rows, search, and the product page. Nothing correct was removed; it simply isn't repeated
inside a bundle card.

**Why the spec was left contradictory rather than fixed:** editing `requirements.md` to match what I
just built is the exact self-serving move the two-Clear discipline exists to prevent — the fresh
validator would then find a spec pre-bent to fit the artifact and would have no way to notice.
**`/validate` should rule on this**: either confirm R14(a) was the right half to keep and reword
R14(b) and its validation row as a Spec-level correction, or reject the interpretation and say what
the card should show instead. It was flagged to the human at the end of Build; no decision was given
before this stage, so nothing was assumed.

Everything else matches the spec.

## Known-shaky areas

**Nothing in this slice has touched a real database.** Every gate run here was static or unit-level:
`typecheck`, `lint`, `format:check`, `build`, and 658 unit tests (up from 612). **The migration has
not been applied anywhere**, the seeder has never run, and no bundle has ever been rendered or added
to a cart. `validation.md`'s preamble says to run `npm run db:migrate` before any write-path row —
that is not optional here, and skipping it produces a hard Postgres error that looks like a code
defect.

**The add path is the highest-risk area and has zero automated coverage.**
`features/cart/add-bundle-to-cart.ts` has no unit test — it is a `"use server"` action that resolves
request context, so it needs the headless `node:http` technique (`{ setHost: false }` plus an
explicit `Host` header) against `npm run preview`. Specifically unexercised: R20 (bundle quantity
summing onto an item already in the cart, then clamping to stock), R21 (partial availability and the
notice), R22 (guest token issued on add but not on render), R23 (another vendor's bundle id writing
nothing).

**`setBundleItems`'s transaction uses `getPrismaWs()`.** Per CLAUDE.md, WebSocket Prisma is reserved
for interactive transactions and this is a legitimate use — but it is a *new* WebSocket call site in
the admin path, and the 50-socket-per-isolate ceiling is what #185/#187 were about. Worth watching
under repeated saves.

**The R14 resolution above is a judgement, not a fact.** If the validator disagrees, the fix is a
component change plus a spec correction, not a bug fix.

**Seed idempotency is asserted but unproven.** `seedBundles` skips by `(vendorId, slug)`, matching
`seedCatalogue`'s per-vendor posture, but R5 asks for two consecutive runs producing identical counts
and that has not been run.

**SriMart has exactly one bundle, of three products across two categories.** A per-vendor rendering
bug would show up there and nowhere else; the vendor-differentiation check needs a real fetch with
`Host: srimart-staging.nocaped.com`, not just Aheed's output.

**The image upload's browser→R2 PUT step is environment-limited**, the same limitation P8.5f
recorded. The key-shape rules are unit-tested (R30), but a real presign→PUT→attach round trip has not
run.
